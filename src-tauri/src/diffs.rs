use crate::{Projects, git, locale, project_path};
use serde::Serialize;
use std::path::Path;
use tauri::{State, WebviewWindow};

#[derive(Clone, Debug, Serialize)]
pub(super) struct CommitFile {
    pub(super) path: String,
    pub(super) old_path: Option<String>,
    pub(super) status: String,
    pub(super) staged: bool,
    pub(super) partially_staged: bool,
}
#[derive(Clone, Debug, Serialize)]
pub(super) struct FileDiff {
    pub(super) commit: String,
    pub(super) file: CommitFile,
    pub(super) patch: String,
    pub(super) truncated: bool,
}

pub(super) fn commit_diff_args(path: &Path, commit: &str) -> Result<Vec<String>, String> {
    if ![40, 64].contains(&commit.len()) || !commit.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(locale::text("err13").into());
    }
    let resolved = git(
        path,
        &["rev-parse", "--verify", &format!("{commit}^{{commit}}")],
    )?;
    let parents = git(
        path,
        &["rev-list", "--parents", "-n", "1", resolved.trim(), "--"],
    )?;
    let parent = parents.split_whitespace().nth(1);
    Ok(if let Some(parent) = parent {
        vec!["diff".into(), parent.into(), commit.into()]
    } else {
        vec![
            "diff-tree".into(),
            "--root".into(),
            "--no-commit-id".into(),
            "-r".into(),
            commit.into(),
        ]
    })
}

pub(super) const WORKTREE: &str = "WORKTREE";

pub(super) fn read_worktree_files(path: &Path) -> Result<Vec<CommitFile>, String> {
    let output = git(
        path,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    let mut fields = output.split_terminator('\0');
    let mut files = Vec::new();
    while let Some(entry) = fields.next() {
        let bytes = entry.as_bytes();
        if bytes.len() < 4 {
            return Err(locale::text("err14").into());
        }
        let renamed = bytes[..2].iter().any(|b| *b == b'R' || *b == b'C');
        let old_path = if renamed {
            Some(fields.next().ok_or(locale::text("err15"))?.to_owned())
        } else {
            None
        };
        let status = if renamed {
            if bytes[..2].contains(&b'R') { "R" } else { "C" }
        } else if bytes[..2].contains(&b'U') || &bytes[..2] == b"AA" || &bytes[..2] == b"DD" {
            "U"
        } else if &bytes[..2] == b"??" {
            "A"
        } else if bytes[1] != b' ' {
            std::str::from_utf8(&bytes[1..2]).unwrap_or("M")
        } else {
            std::str::from_utf8(&bytes[..1]).unwrap_or("M")
        };
        files.push(CommitFile {
            path: entry[3..].into(),
            old_path,
            status: status.into(),
            staged: bytes[0] != b' ' && bytes[0] != b'?' && status != "U",
            partially_staged: bytes[0] != b' '
                && bytes[0] != b'?'
                && bytes[1] != b' '
                && status != "U",
        });
    }
    Ok(files)
}

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum WorktreeDiffScope {
    Staged,
    Unstaged,
}

fn read_worktree_diff(path: &Path, file_path: &str) -> Result<FileDiff, String> {
    read_worktree_diff_scoped(path, file_path, None)
}
pub(super) fn read_worktree_diff_scoped(
    path: &Path,
    file_path: &str,
    scope: Option<WorktreeDiffScope>,
) -> Result<FileDiff, String> {
    let file = read_worktree_files(path)?
        .into_iter()
        .find(|file| file.path == file_path)
        .ok_or(locale::text("err16"))?;
    if matches!(scope, Some(WorktreeDiffScope::Staged)) && !file.staged
        || matches!(scope, Some(WorktreeDiffScope::Unstaged))
            && file.staged
            && !file.partially_staged
    {
        return Err(locale::text("err16").into());
    }
    let untracked = git(
        path,
        &[
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            &format!(":(literal){file_path}"),
        ],
    )?;
    let mut args: Vec<String> = vec![
        "diff".into(),
        "--unified=12".into(),
        "--no-color".into(),
        "--no-ext-diff".into(),
        "--no-textconv".into(),
    ];
    if !untracked.is_empty() {
        args.extend([
            "--no-index".into(),
            "--".into(),
            if cfg!(windows) {
                "NUL".into()
            } else {
                "/dev/null".into()
            },
            path.join(file_path).to_string_lossy().into_owned(),
        ]);
    } else {
        let head = git(path, &["rev-parse", "--revs-only", "HEAD"])?;
        let base = if head.trim().is_empty() {
            git(path, &["hash-object", "-t", "tree", "--stdin"])?
        } else {
            head
        };
        match scope {
            Some(WorktreeDiffScope::Staged) => args.push("--cached".into()),
            Some(WorktreeDiffScope::Unstaged) => {}
            None => args.push(base.trim().into()),
        }
        args.extend(["--find-renames".into(), "--".into()]);
        if let Some(old) = &file.old_path {
            args.push(format!(":(literal){old}"));
        }
        args.push(format!(":(literal){file_path}"));
    }
    let mut patch = git(path, &args.iter().map(String::as_str).collect::<Vec<_>>())?;
    if patch.is_empty() {
        patch = locale::text("err17").into();
    }
    let truncated = patch.len() > 2 * 1024 * 1024;
    if truncated {
        let mut end = 2 * 1024 * 1024;
        while !patch.is_char_boundary(end) {
            end -= 1;
        }
        patch.truncate(end);
    }
    Ok(FileDiff {
        commit: WORKTREE.into(),
        file,
        patch,
        truncated,
    })
}

pub(super) fn read_commit_files(path: &Path, commit: &str) -> Result<Vec<CommitFile>, String> {
    if commit == WORKTREE {
        return read_worktree_files(path);
    }
    let mut args = commit_diff_args(path, commit)?;
    args.extend(
        [
            "--name-status",
            "-z",
            "--find-renames",
            "--no-ext-diff",
            "--no-textconv",
            "--",
        ]
        .map(str::to_owned),
    );
    let output = git(path, &args.iter().map(String::as_str).collect::<Vec<_>>())?;
    let mut fields = output.split_terminator('\0');
    let mut files = Vec::new();
    while let Some(status) = fields.next() {
        let first = fields.next().ok_or(locale::text("err18"))?;
        let renamed = status.starts_with('R') || status.starts_with('C');
        let file = if renamed {
            fields.next().ok_or(locale::text("err19"))?
        } else {
            first
        };
        files.push(CommitFile {
            path: file.into(),
            old_path: renamed.then(|| first.into()),
            status: status.chars().take(1).collect(),
            staged: false,
            partially_staged: false,
        });
    }
    Ok(files)
}

pub(super) fn read_file_diff(
    path: &Path,
    commit: &str,
    file_path: &str,
) -> Result<FileDiff, String> {
    if commit == WORKTREE {
        return read_worktree_diff(path, file_path);
    }
    let file = read_commit_files(path, commit)?
        .into_iter()
        .find(|file| file.path == file_path)
        .ok_or(locale::text("err20"))?;
    let mut args = commit_diff_args(path, commit)?;
    args.extend(
        [
            "--patch",
            "--unified=12",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            "--find-renames",
            "--",
        ]
        .map(str::to_owned),
    );
    if let Some(old) = &file.old_path {
        args.push(format!(":(literal){old}"));
    }
    args.push(format!(":(literal){}", file.path));
    let mut patch = git(path, &args.iter().map(String::as_str).collect::<Vec<_>>())?;
    const LIMIT: usize = 2 * 1024 * 1024;
    let truncated = patch.len() > LIMIT;
    if truncated {
        let mut end = LIMIT;
        while !patch.is_char_boundary(end) {
            end -= 1;
        }
        patch.truncate(end);
    }
    Ok(FileDiff {
        commit: commit.into(),
        file,
        patch,
        truncated,
    })
}

#[tauri::command]
pub(super) async fn get_commit_files(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    commit: String,
) -> Result<Vec<CommitFile>, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || read_commit_files(Path::new(&path), &commit))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub(super) struct CommitDetails {
    pub(super) message: String,
    pub(super) files: Vec<CommitFile>,
}

pub(super) fn read_commit_details(path: &Path, commit: &str) -> Result<CommitDetails, String> {
    if commit == WORKTREE {
        return Ok(CommitDetails {
            message: locale::text("err21").into(),
            files: read_worktree_files(path)?,
        });
    }
    let files = read_commit_files(path, commit)?;
    let message = git(
        path,
        &[
            "show",
            "--no-patch",
            "--no-show-signature",
            "--format=%B",
            commit,
            "--",
        ],
    )?;
    Ok(CommitDetails {
        message: message.trim_end().into(),
        files,
    })
}

#[tauri::command]
pub(super) async fn get_commit_details(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    commit: String,
) -> Result<CommitDetails, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || read_commit_details(Path::new(&path), &commit))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(super) async fn get_file_diff(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    commit: String,
    file_path: String,
    scope: Option<WorktreeDiffScope>,
) -> Result<FileDiff, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        if scope.is_some() {
            if commit != WORKTREE {
                return Err(locale::text("stage09").into());
            }
            read_worktree_diff_scoped(Path::new(&path), &file_path, scope)
        } else {
            read_file_diff(Path::new(&path), &commit, &file_path)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
