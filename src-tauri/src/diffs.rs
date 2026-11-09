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
        return Err(locale::text("error.invalid-sha").into());
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
            return Err(locale::text("error.worktree-status").into());
        }
        let renamed = bytes[..2].iter().any(|b| *b == b'R' || *b == b'C');
        let old_path = if renamed {
            Some(
                fields
                    .next()
                    .ok_or(locale::text("error.missing-original"))?
                    .to_owned(),
            )
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
        .ok_or(locale::text("error.no-file-changes"))?;
    if matches!(scope, Some(WorktreeDiffScope::Staged)) && !file.staged
        || matches!(scope, Some(WorktreeDiffScope::Unstaged))
            && file.staged
            && !file.partially_staged
    {
        return Err(locale::text("error.no-file-changes").into());
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
        patch = locale::text("error.index-cancels-changes").into();
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
        let first = fields.next().ok_or(locale::text("error.file-path"))?;
        let renamed = status.starts_with('R') || status.starts_with('C');
        let file = if renamed {
            fields.next().ok_or(locale::text("error.renamed-path"))?
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
        .ok_or(locale::text("error.file-not-found"))?;
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
            message: locale::text("error.worktree-summary").into(),
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
                return Err(locale::text("stage.invalid-scope").into());
            }
            read_worktree_diff_scoped(Path::new(&path), &file_path, scope)
        } else {
            read_file_diff(Path::new(&path), &commit, &file_path)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn stage_hunk(
    path: &Path,
    file_path: &str,
    snapshot: &str,
    index: usize,
) -> Result<CommitDetails, String> {
    let stale = || locale::text("stage.hunk-stale").to_owned();
    crate::stash::ensure_no_operation(path)?;
    let diff = read_worktree_diff_scoped(path, file_path, Some(WorktreeDiffScope::Unstaged))
        .map_err(|_| stale())?;
    if diff.truncated
        || diff.file.status != "M"
        || diff.file.old_path.is_some()
        || snapshot.contains('\u{fffd}')
        || diff.patch != snapshot
    {
        return Err(stale());
    }
    let mut offset = 0;
    let mut hunks = Vec::new();
    for line in snapshot.split_inclusive('\n') {
        if line.starts_with("@@ ") {
            hunks.push(offset);
        }
        offset += line.len();
    }
    let start = *hunks.get(index).ok_or_else(stale)?;
    let header = &snapshot[..hunks[0]];
    if !header.starts_with("diff --git ")
        || header.lines().count() != 4
        || !header.lines().nth(1).is_some_and(|line| {
            line.starts_with("index ") && (line.ends_with(" 100644") || line.ends_with(" 100755"))
        })
        || !header
            .lines()
            .nth(2)
            .is_some_and(|line| line.starts_with("--- a/") || line.starts_with("--- \"a/"))
        || !header
            .lines()
            .nth(3)
            .is_some_and(|line| line.starts_with("+++ b/") || line.starts_with("+++ \"b/"))
    {
        return Err(stale());
    }
    let end = hunks.get(index + 1).copied().unwrap_or(snapshot.len());
    let patch = format!("{header}{}", &snapshot[start..end]);
    crate::git_command::git_with_input(
        path,
        &["apply", "--cached", "--whitespace=nowarn", "-"],
        &patch,
        &[],
    )?;
    read_commit_details(path, WORKTREE)
}

#[tauri::command]
pub(super) async fn stage_worktree_hunk(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    file_path: String,
    snapshot: String,
    index: usize,
) -> Result<CommitDetails, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        stage_hunk(Path::new(&path), &file_path, &snapshot, index)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod hunk_tests {
    use super::*;
    use crate::tests::{TempRepo, commit_file};

    #[test]
    fn stages_one_hunk_and_rejects_stale_snapshots() {
        let repo = TempRepo::new();
        repo.init();
        let mut lines: Vec<_> = (0..100).map(|line| format!("line {line}\n")).collect();
        commit_file(&repo, &lines.concat(), "base");
        lines[2] = "first edit\n".into();
        lines[80] = "second edit\n".into();
        let working = lines.concat();
        std::fs::write(repo.0.join("file.txt"), &working).unwrap();
        let snapshot =
            read_worktree_diff_scoped(&repo.0, "file.txt", Some(WorktreeDiffScope::Unstaged))
                .unwrap();
        let updated = stage_hunk(&repo.0, "file.txt", &snapshot.patch, 1).unwrap();
        assert!(updated.files[0].partially_staged);
        let cached = git(&repo.0, &["diff", "--cached"]).unwrap();
        assert!(cached.contains("+second edit"));
        assert!(!cached.contains("first edit"));
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            working
        );
        assert!(stage_hunk(&repo.0, "file.txt", &snapshot.patch, 0).is_err());
    }
}
