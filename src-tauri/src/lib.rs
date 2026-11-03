mod development_guard;
mod commit_ops;
mod commit_options;
mod conflicts;
mod history_search;
mod git_settings;
mod git_installation;
mod locale;
mod process;
mod stash;
mod sync_status;
mod fetch_status;
mod file_actions;
mod terminal_log;
mod tracking;
mod tags;
mod reference_actions;
mod update_menu;
mod updates;

use serde::Serialize;
use std::{
    collections::HashMap,
    path::Path,
    sync::Mutex,
};
use tauri::{Manager, State, WebviewWindow};

#[derive(Clone, Debug, Serialize)]
struct CommitReference {
    name: String,
    kind: String,
}

fn read_commit_references(path: &Path) -> Result<HashMap<String, Vec<CommitReference>>, String> {
    let output = git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(objectname)%00%(objecttype)%00%(symref)",
            "refs/heads/",
            "refs/remotes/",
            "refs/tags/",
        ],
    )?;
    let mut references: HashMap<String, Vec<CommitReference>> = HashMap::new();
    for line in output.lines() {
        let fields: Vec<_> = line.split('\0').collect();
        if fields.len() != 4 || !fields[3].is_empty() {
            continue;
        }
        let (kind, name) = if let Some(name) = fields[0].strip_prefix("refs/heads/") {
            ("branch", name)
        } else if let Some(name) = fields[0].strip_prefix("refs/remotes/") {
            ("remote", name)
        } else if let Some(name) = fields[0].strip_prefix("refs/tags/") {
            ("tag", name)
        } else {
            continue;
        };
        let hash = if fields[2] == "tag" {
            match git(
                path,
                &[
                    "rev-parse",
                    "--verify",
                    &format!("{}^{{commit}}", fields[0]),
                ],
            ) {
                Ok(hash) => hash.trim().to_owned(),
                Err(_) => continue,
            }
        } else if fields[2] == "commit" {
            fields[1].into()
        } else {
            continue;
        };
        references.entry(hash).or_default().push(CommitReference {
            name: name.into(),
            kind: kind.into(),
        });
    }
    Ok(references)
}

#[derive(Clone, Debug, Serialize)]
struct Commit {
    hash: String,
    author: String,
    date: String,
    subject: String,
    parents: Vec<String>,
    refs: Vec<CommitReference>,
}
#[derive(Clone, Debug, Serialize)]
struct Remote {
    name: String,
    branches: Vec<String>,
}

fn read_remotes(path: &Path) -> Result<Vec<Remote>, String> {
    let names = git(path, &["remote"])?;
    names
        .lines()
        .map(|name| {
            let prefix = format!("refs/remotes/{name}/");
            let refs = git(
                path,
                &["for-each-ref", "--format=%(refname)%00%(symref)", &prefix],
            )?;
            let branches = refs
                .lines()
                .filter_map(|line| {
                    let (reference, symbolic) = line.split_once('\0')?;
                    if !symbolic.is_empty() {
                        return None;
                    }
                    reference.strip_prefix(&prefix).map(str::to_owned)
                })
                .collect();
            Ok(Remote {
                name: name.into(),
                branches,
            })
        })
        .collect()
}

#[derive(Clone, Debug, Serialize)]
struct BranchComparison {
    base: String,
    ahead: usize,
    behind: usize,
}

fn read_branch_comparisons(
    path: &Path,
    head: &str,
) -> Result<HashMap<String, BranchComparison>, String> {
    let mut comparisons = HashMap::new();
    if head.is_empty() {
        return Ok(comparisons);
    }
    let refs = git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(upstream)",
            "refs/heads/",
        ],
    )?;
    for line in refs.lines() {
        let Some((reference, upstream)) = line.split_once('\0') else {
            continue;
        };
        let count = |base: &str| {
            git(
                path,
                &[
                    "rev-list",
                    "--left-right",
                    "--count",
                    &format!("{reference}...{base}"),
                    "--",
                ],
            )
        };
        let (base, counts) = if !upstream.is_empty() {
            match count(upstream) {
                Ok(counts) => (
                    upstream
                        .strip_prefix("refs/remotes/")
                        .unwrap_or(upstream)
                        .to_owned(),
                    counts,
                ),
                Err(_) => ("HEAD".into(), count(head)?),
            }
        } else {
            ("HEAD".into(), count(head)?)
        };
        let values: Vec<_> = counts.split_whitespace().collect();
        if let [ahead, behind] = values.as_slice() {
            comparisons.insert(
                reference.trim_start_matches("refs/heads/").into(),
                BranchComparison {
                    base,
                    ahead: ahead.parse().map_err(|_| locale::text("err08"))?,
                    behind: behind.parse().map_err(|_| locale::text("err08"))?,
                },
            );
        }
    }
    Ok(comparisons)
}

#[derive(Clone, Debug, Serialize)]
struct ProjectHistory {
    path: String,
    commits: Vec<Commit>,
    branches: Vec<String>,
    branch_comparisons: HashMap<String, BranchComparison>,
    branch_tips: HashMap<String, String>,
    tags: Vec<String>,
    stashes: Vec<stash::StashEntry>,
    remotes: Vec<Remote>,
    current_branch: String,
    sync: sync_status::SyncStatus,
    last_fetch: Option<u64>,
    operation: Option<commit_ops::Operation>,
    conflicts: Vec<CommitFile>,
    tip: String,
    has_more: bool,
    has_changes: bool,
    worktree_files: Vec<CommitFile>,
}
#[derive(Default)]
struct Projects(Mutex<HashMap<String, ProjectHistory>>);
#[derive(Clone, Debug, Serialize)]
struct CommitFile {
    path: String,
    old_path: Option<String>,
    status: String,
    staged: bool,
    partially_staged: bool,
}
#[derive(Clone, Debug, Serialize)]
struct FileDiff {
    commit: String,
    file: CommitFile,
    patch: String,
    truncated: bool,
}

#[derive(Default)]
struct RecentProjects(Mutex<()>);
#[derive(Serialize)]
struct OpenProjectResult {
    history: ProjectHistory,
    recent_projects: Vec<String>,
    warning: Option<String>,
}

fn load_recent(file: &Path) -> Result<Vec<String>, String> {
    match std::fs::read(file) {
        Ok(bytes) => {
            let paths: Vec<String> = serde_json::from_slice(&bytes)
                .map_err(|e| locale::format("err01", &[("e", e.to_string())]))?;
            let mut unique = Vec::new();
            for path in paths {
                if !unique.contains(&path) {
                    unique.push(path);
                }
            }
            unique.truncate(5);
            Ok(unique)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(locale::format("err01", &[("e", e.to_string())])),
    }
}

fn save_recent(file: &Path, path: String) -> Result<Vec<String>, String> {
    let mut paths = load_recent(file)?;
    paths.retain(|existing| existing != &path);
    paths.insert(0, path);
    paths.truncate(5);
    let directory = file.parent().ok_or(locale::text("err09"))?;
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let temporary = file.with_extension("tmp");
    let bytes = serde_json::to_vec_pretty(&paths).map_err(|e| e.to_string())?;
    std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, file).map_err(|e| e.to_string())?;
    Ok(paths)
}

#[tauri::command]
fn get_recent_projects(
    app: tauri::AppHandle,
    recent: State<RecentProjects>,
) -> Result<Vec<String>, String> {
    let _guard = recent.0.lock().map_err(|e| e.to_string())?;
    let file = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("recent-projects.json");
    load_recent(&file)
}

#[cfg(test)]
static NEXT_TEST_REPO: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(1);

fn git(path: &Path, args: &[&str]) -> Result<String, String> {
    Ok(String::from_utf8_lossy(&git_bytes(path, args)?).into_owned())
}

fn git_bytes(path: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let log_id = terminal_log::begin(path, args);
    let output = process::background("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_COMMON_DIR")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .output()
        .map_err(|e| {
            let message = locale::format("err02", &[("e", e.to_string())]);
            terminal_log::finish(path, log_id, message.clone(), false, None);
            message
        })?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = if stdout.is_empty() {
        stderr.to_string()
    } else if stderr.is_empty() {
        stdout.to_string()
    } else {
        format!("{}\n{}", stdout.trim_end(), stderr)
    };
    terminal_log::finish(
        path,
        log_id,
        combined,
        output.status.success(),
        output.status.code(),
    );
    if !output.status.success()
        && !(args.contains(&"--no-index") && output.status.code() == Some(1))
    {
        return Err(locale::format(
            "err03",
            &[(
                "p1",
                (String::from_utf8_lossy(&output.stderr).trim()).to_string(),
            )],
        ));
    }
    Ok(output.stdout)
}

fn read_history(path: &Path) -> Result<ProjectHistory, String> {
    let path = path
        .canonicalize()
        .map_err(|_| locale::text("err10").to_string())?;
    if !path.is_dir() || !path.join(".git").is_dir() {
        return Err(locale::text("err11").into());
    }
    git(&path, &["rev-parse", "--git-dir"])?;
    let refs = git(&path, &["rev-parse", "--revs-only", "HEAD"])?;
    let tip = refs.trim().to_owned();
    let branch_tips: HashMap<String, String> = git(&path, &["for-each-ref", "--format=%(refname)%00%(objectname)", "refs/heads/", "refs/remotes/"])?
        .lines().filter_map(|line| line.split_once('\0').map(|(name, tip)| (name.to_owned(), tip.to_owned()))).collect();
    let tips: Vec<String> = branch_tips.values().cloned().collect();
    let page = read_branch_commit_page_at_tips(&path, &tip, 0, true, Some(&tips))?;
    let working_files = read_worktree_files(&path)?;
    let current_branch = git(&path, &["branch", "--show-current"])?.trim().to_owned();
    Ok(ProjectHistory {
        conflicts: working_files
            .iter()
            .filter(|file| file.status == "U")
            .cloned()
            .collect(),
        operation: commit_ops::read(&path)?,
        stashes: stash::list(&path)?,
        sync: sync_status::read(&path, &tip, &current_branch)?,
        last_fetch: fetch_status::read(&path),
        path: path.to_string_lossy().into_owned(),
        commits: page.commits,
        branch_comparisons: read_branch_comparisons(&path, &tip)?,
        branch_tips,
        tip,
        has_more: page.has_more,
        has_changes: !working_files.is_empty(),
        worktree_files: working_files,
        tags: git(
            &path,
            &["for-each-ref", "--format=%(refname:strip=2)", "refs/tags/"],
        )?
        .lines()
        .map(str::to_owned)
        .collect(),
        remotes: read_remotes(&path)?,
        branches: git(
            &path,
            &["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
        )?
        .lines()
        .map(str::to_owned)
        .collect(),
        current_branch,
    })
}

const PAGE_SIZE: usize = 50;
#[derive(Debug, Serialize)]
struct CommitPage {
    commits: Vec<Commit>,
    has_more: bool,
}

#[cfg(test)]
fn read_commit_page(path: &Path, tip: &str, offset: usize) -> Result<CommitPage, String> {
    read_branch_commit_page(path, tip, offset, true)
}

#[cfg(test)]
fn read_branch_commit_page(path: &Path, tip: &str, offset: usize, all_branches: bool) -> Result<CommitPage, String> {
    read_branch_commit_page_at_tips(path, tip, offset, all_branches, None)
}

fn read_branch_commit_page_at_tips(path: &Path, tip: &str, offset: usize, all_branches: bool, tips: Option<&[String]>) -> Result<CommitPage, String> {
    if tip.is_empty() {
        return Ok(CommitPage {
            commits: vec![],
            has_more: false,
        });
    }
    if ![40, 64].contains(&tip.len()) || !tip.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(locale::text("err12").into());
    }
    read_commit_range_with_refs(path, tip, offset, all_branches, tips)
}

fn read_commit_range(path: &Path, revision: &str, offset: usize) -> Result<CommitPage, String> {
    read_commit_range_with_refs(path, revision, offset, false, None)
}

fn read_commit_range_with_refs(path: &Path, revision: &str, offset: usize, include_refs: bool, tips: Option<&[String]>) -> Result<CommitPage, String> {
    let count = format!("--max-count={}", PAGE_SIZE + 1);
    let skip = format!("--skip={offset}");
    let mut args = vec![
        "--no-pager", "log", "--topo-order", &count, &skip,
        "--no-show-signature", "--format=%H%x00%an%x00%aI%x00%s%x00%P", "-z",
    ];
    if include_refs {
        if let Some(tips) = tips {
            if tips.iter().any(|tip| ![40, 64].contains(&tip.len()) || !tip.bytes().all(|c| c.is_ascii_hexdigit())) { return Err(locale::text("err12").into()); }
            args.extend(tips.iter().map(String::as_str));
        } else { args.extend(["--branches", "--remotes"]); }
    }
    args.extend([revision, "--"]);
    let log = git(path, &args)?;
    parse_commit_log(path, &log)
}

fn parse_commit_log(path: &Path, log: &str) -> Result<CommitPage, String> {
    let references = read_commit_references(path)?;
    let fields: Vec<_> = log.split_terminator('\0').collect();
    let mut commits: Vec<_> = fields
        .chunks_exact(5)
        .map(|row| Commit {
            hash: row[0].into(),
            author: row[1].into(),
            date: row[2].into(),
            subject: row[3].into(),
            refs: references.get(row[0]).cloned().unwrap_or_default(),
            parents: row[4].split_whitespace().map(str::to_owned).collect(),
        })
        .collect();
    let has_more = commits.len() > PAGE_SIZE;
    commits.truncate(PAGE_SIZE);
    Ok(CommitPage { commits, has_more })
}

#[tauri::command]
async fn get_commit_page(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    tip: String,
    offset: usize,
    all_branches: Option<bool>,
    tips: Option<Vec<String>>,
) -> Result<CommitPage, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || read_branch_commit_page_at_tips(Path::new(&path), &tip, offset, all_branches.unwrap_or(true), tips.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_sync_commit_page(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    local_tip: String,
    remote_tip: String,
    direction: String,
    offset: usize,
) -> Result<CommitPage, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        sync_status::page(
            Path::new(&path),
            &local_tip,
            &remote_tip,
            &direction,
            offset,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

fn commit_diff_args(path: &Path, commit: &str) -> Result<Vec<String>, String> {
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

const WORKTREE: &str = "WORKTREE";

fn read_worktree_files(path: &Path) -> Result<Vec<CommitFile>, String> {
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
enum WorktreeDiffScope {
    Staged,
    Unstaged,
}

fn read_worktree_diff(path: &Path, file_path: &str) -> Result<FileDiff, String> {
    read_worktree_diff_scoped(path, file_path, None)
}
fn read_worktree_diff_scoped(
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

fn read_commit_files(path: &Path, commit: &str) -> Result<Vec<CommitFile>, String> {
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

fn read_file_diff(path: &Path, commit: &str, file_path: &str) -> Result<FileDiff, String> {
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
async fn get_commit_files(
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
struct CommitDetails {
    message: String,
    files: Vec<CommitFile>,
}

fn read_commit_details(path: &Path, commit: &str) -> Result<CommitDetails, String> {
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
async fn get_commit_details(
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
async fn get_file_diff(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    commit: String,
    file_path: String,
    scope: Option<WorktreeDiffScope>,
) -> Result<FileDiff, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        if scope.is_some() {
            if commit != WORKTREE { return Err(locale::text("stage09").into()); }
            read_worktree_diff_scoped(Path::new(&path), &file_path, scope)
        } else {
            read_file_diff(Path::new(&path), &commit, &file_path)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn can_initialize_repository(path: &Path) -> Result<bool, String> {
    let path = path
        .canonicalize()
        .map_err(|_| locale::text("err10").to_string())?;
    if !path.is_dir() {
        return Err(locale::text("err22").into());
    }
    match std::fs::symlink_metadata(path.join(".git")) {
        Ok(_) => Ok(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(locale::format("err04", &[("error", error.to_string())])),
    }
}

fn initialize_repository(path: &Path) -> Result<(), String> {
    if !can_initialize_repository(path)? {
        return Err(locale::text("err23").into());
    }
    git(path, &["init"])?;
    Ok(())
}

#[tauri::command]
async fn can_initialize_project(path: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || can_initialize_repository(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn initialize_project(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || initialize_repository(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_project(
    app: tauri::AppHandle,
    window: WebviewWindow,
    path: String,
) -> Result<OpenProjectResult, String> {
    let history = tauri::async_runtime::spawn_blocking(move || read_history(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())??;
    let title = Path::new(&history.path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| history.path.clone());
    window.set_title(&title).map_err(|e| e.to_string())?;
    let canonical_path = history.path.clone();
    app.state::<Projects>().0.lock().map_err(|e| e.to_string())?
        .insert(window.label().to_owned(), history.clone());
    let saved = (|| {
        let recent = app.state::<RecentProjects>();
        let _guard = recent.0.lock().map_err(|e| e.to_string())?;
        let file = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("recent-projects.json");
        save_recent(&file, canonical_path)
    })();
    Ok(match saved {
        Ok(recent_projects) => OpenProjectResult {
            history,
            recent_projects,
            warning: None,
        },
        Err(error) => OpenProjectResult {
            history,
            recent_projects: vec![],
            warning: Some(locale::format("err07", &[("error", error.to_string())])),
        },
    })
}

#[tauri::command]
fn frontend_ready(window: WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|e| e.to_string())?;
    if !url.query_pairs().any(|(key, _)| key == "view") {
        window.set_title("").map_err(|e| e.to_string())?;
    }
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_project_chooser(
    window: WebviewWindow,
    projects: State<'_, Projects>,
) -> Result<(), String> {
    window.set_title("").map_err(|e| e.to_string())?;
    projects.0.lock().map_err(|e| e.to_string())?.remove(window.label());
    Ok(())
}

fn project_path(window: &WebviewWindow, projects: &Projects) -> Result<String, String> {
    projects
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .get(window.label())
        .map(|project| project.path.clone())
        .ok_or_else(|| locale::text("err24").into())
}

#[tauri::command]
fn get_project_terminal_log(
    window: WebviewWindow,
    projects: State<Projects>,
) -> Result<Option<terminal_log::TerminalLog>, String> {
    let path = project_path(&window, &projects)?;
    terminal_log::latest(Path::new(&path))
}

#[tauri::command]
async fn get_project_history(
    window: WebviewWindow,
    projects: State<'_, Projects>,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || read_history(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

fn switch_branch(path: &Path, branch: &str) -> Result<ProjectHistory, String> {
    development_guard::ensure_safe(path)?;
    let history = read_history(path)?;
    if !history.branches.iter().any(|name| name == branch) {
        return Err(locale::text("err25").into());
    }
    git(path, &["switch", "--no-guess", "--", branch])?;
    read_history(path)
}

#[tauri::command]
async fn switch_project_branch(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    branch: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || switch_branch(Path::new(&path), &branch))
        .await
        .map_err(|e| e.to_string())?
}

fn validate_branch_name(path: &Path, name: &str) -> Result<(), String> {
    if name.is_empty() || name.trim() != name || name.starts_with('-') {
        return Err(locale::text("err26").into());
    }
    git(path, &["check-ref-format", &format!("refs/heads/{name}")])
        .map_err(|_| locale::text("err27").to_string())?;
    Ok(())
}

fn create_branch_at_commit(
    path: &Path,
    name: &str,
    commit: &str,
) -> Result<ProjectHistory, String> {
    validate_branch_name(path, name)?;
    commit_diff_args(path, commit)?;
    git(path, &["branch", name, commit])?;
    read_history(path)
}

#[tauri::command]
async fn create_project_branch_at_commit(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    name: String,
    commit: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        create_branch_at_commit(Path::new(&path), &name, &commit)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn create_branch(path: &Path, name: &str) -> Result<ProjectHistory, String> {
    validate_branch_name(path, name)?;
    let history = read_history(path)?;
    if history.tip.is_empty() {
        return Err(locale::text("err28").into());
    }
    if history.branches.iter().any(|branch| branch == name) {
        return Err(locale::text("err29").into());
    }
    git(path, &["switch", "-c", name])?;
    read_history(path)
}

#[tauri::command]
async fn create_project_branch(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    name: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || create_branch(Path::new(&path), &name))
        .await
        .map_err(|e| e.to_string())?
}

fn create_tag(path: &Path, name: &str) -> Result<ProjectHistory, String> {
    create_tag_at_commit(path, name, "HEAD")
}

fn create_tag_at_commit(path: &Path, name: &str, commit: &str) -> Result<ProjectHistory, String> {
    if name.is_empty() || name.trim() != name || name.starts_with('-') {
        return Err(locale::text("err30").into());
    }
    git(path, &["check-ref-format", &format!("refs/tags/{name}")])
        .map_err(|_| locale::text("err31").to_string())?;
    let history = read_history(path)?;
    if history.tip.is_empty() {
        return Err(locale::text("err32").into());
    }
    if history.tags.iter().any(|tag| tag == name) {
        return Err(locale::text("err33").into());
    }
    if commit != "HEAD" {
        commit_diff_args(path, commit)?;
    }
    git(path, &["tag", name, commit])?;
    read_history(path)
}

fn checkout_commit(path: &Path, commit: &str) -> Result<ProjectHistory, String> {
    development_guard::ensure_safe(path)?;
    commit_diff_args(path, commit)?;
    git(path, &["switch", "--detach", commit])?;
    read_history(path)
}

fn reset_branch_to_commit(
    path: &Path,
    commit: &str,
    mode: &str,
    discard_confirmed: bool,
) -> Result<ProjectHistory, String> {
    commit_diff_args(path, commit)?;
    if git(path, &["branch", "--show-current"])?.trim().is_empty() {
        return Err(locale::text("err34").into());
    }
    let flag = match mode {
        "soft" => "--soft",
        "mixed" => "--mixed",
        "hard" if discard_confirmed => "--hard",
        "hard" => return Err(locale::text("err35").into()),
        _ => return Err(locale::text("err36").into()),
    };
    git(path, &["reset", flag, commit, "--"])?;
    read_history(path)
}

#[tauri::command]
async fn checkout_project_commit(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    commit: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || checkout_commit(Path::new(&path), &commit))
        .await
        .map_err(|e| e.to_string())?
}

fn reset_branch_to_commit_checked(
    path: &Path, commit: &str, mode: &str, confirmed: bool,
    expected_head: &str, expected_branch: &str,
) -> Result<ProjectHistory, String> {
    if git(path, &["rev-parse", "HEAD"])?.trim() != expected_head
        || git(path, &["branch", "--show-current"])?.trim() != expected_branch
    {
        return Err(locale::text("safe05").into());
    }
    reset_branch_to_commit(path, commit, mode, confirmed)
}

#[tauri::command]
async fn reset_project_commit(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    commit: String,
    mode: String,
    discard_confirmed: bool,
    expected_head: String,
    expected_branch: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        reset_branch_to_commit_checked(
            Path::new(&path), &commit, &mode, discard_confirmed,
            &expected_head, &expected_branch,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_project_tag_at_commit(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    name: String,
    commit: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        create_tag_at_commit(Path::new(&path), &name, &commit)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn add_remote(path: &Path, name: &str, url: &str) -> Result<ProjectHistory, String> {
    if name.is_empty()
        || name.trim() != name
        || name.starts_with('-')
        || name.chars().any(char::is_whitespace)
    {
        return Err(locale::text("err37").into());
    }
    git(
        path,
        &["check-ref-format", &format!("refs/remotes/{name}/check")],
    )
    .map_err(|_| locale::text("err38").to_string())?;
    if url.trim().is_empty() || url.trim() != url || url.chars().any(char::is_control) {
        return Err(locale::text("err39").into());
    }
    if read_history(path)?
        .remotes
        .iter()
        .any(|remote| remote.name == name)
    {
        return Err(locale::text("err40").into());
    }
    git(path, &["remote", "add", "--", name, url])?;
    read_history(path)
}

#[tauri::command]
async fn create_project_tag(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    name: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || create_tag(Path::new(&path), &name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_project_remote(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    name: String,
    url: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || add_remote(Path::new(&path), &name, &url))
        .await
        .map_err(|e| e.to_string())?
}

fn set_file_staged(path: &Path, file_path: &str, staged: bool) -> Result<CommitDetails, String> {
    let file = read_worktree_files(path)?
        .into_iter()
        .find(|file| file.path == file_path)
        .ok_or(locale::text("err41"))?;
    let mut paths = vec![format!(":(literal){}", file.path)];
    if let Some(old) = &file.old_path {
        let literal = format!(":(literal){old}");
        if !staged || !git(path, &["ls-files", "-z", "--", &literal])?.is_empty() {
            paths.push(literal);
        }
    }
    if staged {
        // Stage the currently visible file contents, including deletions.
        let mut args = vec!["add", "--all", "--"];
        args.extend(paths.iter().map(String::as_str));
        git(path, &args)?;
    } else {
        let head = git(path, &["rev-parse", "--revs-only", "HEAD"])?;
        let mut args = if head.trim().is_empty() {
            vec!["rm", "--cached", "--force", "--ignore-unmatch", "--"]
        } else {
            vec!["reset", "--quiet", "HEAD", "--"]
        };
        args.extend(paths.iter().map(String::as_str));
        git(path, &args)?;
    }
    read_commit_details(path, WORKTREE)
}

#[cfg(test)]
fn commit_staged(path: &Path, message: &str) -> Result<ProjectHistory, String> {
    commit_staged_with_options(path, message, &commit_options::Options::default())
}
fn commit_staged_with_options(
    path: &Path,
    message: &str,
    options: &commit_options::Options,
) -> Result<ProjectHistory, String> {
    if message.trim().is_empty() {
        return Err(locale::text("err42").into());
    }
    if git(path, &["diff", "--cached", "--name-only", "-z"])?.is_empty() {
        return Err(locale::text("err43").into());
    }
    commit_options::commit(path, message, false, options)?;
    read_history(path)
}

#[tauri::command]
async fn set_project_file_staged(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    file_path: String,
    staged: bool,
) -> Result<CommitDetails, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        set_file_staged(Path::new(&path), &file_path, staged)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn commit_project_changes(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    message: String,
    options: Option<commit_options::Options>,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        commit_staged_with_options(Path::new(&path), &message, &options.unwrap_or_default())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn sync_repository(path: &Path, action: &str) -> Result<ProjectHistory, String> {
    let history = read_history(path)?;
    if action != "fetch" && history.current_branch.is_empty() {
        return Err(locale::text("err44").into());
    }
    if history.remotes.is_empty() {
        return Err(locale::text("err45").into());
    }
    match action {
        "fetch" => {
            git(path, &["fetch", "--all", "--prune"])?;
            fetch_status::record(path);
        }
        "pull" => {
            tracking::pull_current(path)?;
            fetch_status::record(path);
        }
        "push" => {
            tracking::push_current(path)?;
        }
        _ => return Err(locale::text("err46").into()),
    }
    read_history(path)
}

#[tauri::command]
async fn sync_project(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    action: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || sync_repository(Path::new(&path), &action))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            locale::load(app.handle());
            update_menu::install(app.handle())?;
            if let Some(window) = app.get_webview_window("main") {
                if let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) {
                    let work_area = monitor.work_area();
                    let scale = window.scale_factor()?;
                    let inner = window.inner_size()?;
                    let outer = window.outer_size()?;
                    let frame_width = outer.width.saturating_sub(inner.width);
                    let frame_height = outer.height.saturating_sub(inner.height);
                    let width = ((960.0 * scale).round() as u32)
                        .min(work_area.size.width.saturating_sub(frame_width))
                        .max(1);
                    let height = ((720.0 * scale).round() as u32)
                        .min(work_area.size.height.saturating_sub(frame_height))
                        .max(1);
                    window.set_size(tauri::PhysicalSize::new(width, height))?;
                    window.set_position(tauri::PhysicalPosition::new(
                        work_area.position.x
                            + (work_area.size.width.saturating_sub(width + frame_width) / 2) as i32,
                        work_area.position.y
                            + (work_area.size.height.saturating_sub(height + frame_height) / 2)
                                as i32,
                    ))?;
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == update_menu::CHECK_UPDATES {
                if let Err(error) = update_menu::show(app) {
                    eprintln!("{error}");
                }
            } else if event.id().as_ref() == update_menu::SETTINGS {
                if let Err(error) = update_menu::show_dialog(app, update_menu::SETTINGS) {
                    eprintln!("{error}");
                }
            } else if event.id().as_ref() == update_menu::KEYBOARD_SHORTCUTS {
                if let Err(error) = update_menu::show_dialog(app, update_menu::KEYBOARD_SHORTCUTS) {
                    eprintln!("{error}");
                }
            }
        })
        .manage(updates::PendingUpdate::default())
        .manage(Projects::default())
        .manage(RecentProjects::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            file_actions::file_actions_platform,
            file_actions::preview_restore_path,
            file_actions::restore_project_path,
            file_actions::reveal_project_path,
            git_installation::get_git_installation,
            git_settings::get_git_settings,
            git_settings::save_git_settings,
            locale::get_app_language,
            locale::set_app_language,
            updates::get_update_settings,
            updates::check_app_update,
            updates::install_app_update,
            open_project,
            can_initialize_project,
            initialize_project,
            get_recent_projects,
            get_project_history,
            get_project_terminal_log,
            get_commit_page,
            stash::stash_project,
            stash::get_stash_details,
            stash::get_stash_diff,
            history_search::get_filtered_commit_page,
            get_sync_commit_page,
            get_commit_files,
            get_commit_details,
            get_file_diff,
            conflicts::get_conflict_file,
            conflicts::resolve_conflict_file,
            switch_project_branch,
            create_project_branch,
            create_project_branch_at_commit,
            create_project_tag,
            checkout_project_commit,
            reset_project_commit,
            create_project_tag_at_commit,
            set_project_file_staged,
            commit_project_changes,
            add_project_remote,
            show_project_chooser,
            frontend_ready,
            sync_project,
            commit_ops::run_commit_operation,
            reference_actions::change_project_reference,
            tags::push_project_tags,
            tags::delete_project_tag,
            tags::remote_project_tag_exists,
            tracking::publish_project_branch,
            tracking::set_project_upstream,
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Ok(mut projects) = window.state::<Projects>().0.lock() {
                    projects.remove(window.label());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect(locale::text("appErr"));
}

#[cfg(test)]
mod tests {
    use super::*;
    pub(super) struct TempRepo(pub(super) std::path::PathBuf);
    impl TempRepo {
        pub(super) fn new() -> Self {
            let p = std::env::temp_dir().join(format!(
                "git-ui-test-{}-{}",
                std::process::id(),
                NEXT_TEST_REPO.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            std::fs::create_dir_all(&p).unwrap();
            Self(p)
        }
        pub(super) fn init(&self) {
            git(&self.0, &["init"]).unwrap();
        }
    }
    impl Drop for TempRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    #[cfg(debug_assertions)]
    fn switching_running_sources_is_rejected_before_git_can_modify_files() {
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let before = git(source, &["rev-parse", "HEAD"]).unwrap();
        // Even invalid targets must be rejected before any checkout is attempted.
        assert_eq!(switch_branch(source, "invalid-target").unwrap_err(), locale::text("dev01"));
        assert_eq!(checkout_commit(source, "HEAD").unwrap_err(), locale::text("dev01"));
        assert_eq!(before, git(source, &["rev-parse", "HEAD"]).unwrap());
    }

    #[test]
    fn branch_history_switches_scope_without_checking_out_or_losing_pagination() {
        let repo = TempRepo::new(); repo.init(); commit_file(&repo, "base", "base");
        let main = git(&repo.0, &["branch", "--show-current"]).unwrap();
        git(&repo.0, &["checkout", "-b", "side"]).unwrap();
        for i in 0..PAGE_SIZE + 2 { commit_file(&repo, &format!("side {i}"), &format!("Side {i}")); }
        let side_tip = git(&repo.0, &["rev-parse", "HEAD"]).unwrap().trim().to_owned();
        git(&repo.0, &["checkout", main.trim()]).unwrap();
        commit_file(&repo, "main", "Main only");
        let history = read_history(&repo.0).unwrap();
        assert_eq!(history.branch_tips["refs/heads/side"], side_tip);
        let mut all = history.commits;
        let mut more = history.has_more;
        while more {
            let page = read_branch_commit_page(&repo.0, &history.tip, all.len(), true).unwrap();
            more = page.has_more; all.extend(page.commits);
        }
        assert!(all.iter().any(|commit| commit.hash == side_tip));
        assert!(all.iter().any(|commit| commit.subject == "Main only"));
        assert_eq!(all.len(), PAGE_SIZE + 4);
        assert_eq!(all.iter().map(|commit| &commit.hash).collect::<std::collections::HashSet<_>>().len(), all.len());
        let current = read_branch_commit_page(&repo.0, &history.tip, 0, false).unwrap();
        assert_eq!(current.commits.len(), 2);
        let selected = read_branch_commit_page(&repo.0, &side_tip, 0, false).unwrap();
        assert!(selected.has_more);
        assert!(!selected.commits.iter().any(|commit| commit.subject == "Main only"));
        let filter = history_search::HistoryFilter { text: "Side".into(), ..Default::default() };
        assert!(history_search::page_with_branches(&repo.0, &history.tip, None, "all", &filter, 0, false).unwrap().commits.is_empty());
        assert_eq!(history_search::page_with_branches(&repo.0, &history.tip, None, "all", &filter, 0, true).unwrap().commits.len(), PAGE_SIZE);
        let sha_filter = history_search::HistoryFilter { sha: side_tip[..8].into(), ..Default::default() };
        let matches = history_search::page_with_branches(&repo.0, &history.tip, None, "all", &sha_filter, 0, true).unwrap();
        assert_eq!(matches.commits.len(), 1);
        assert_eq!(matches.commits[0].hash, side_tip);
        assert_eq!(git(&repo.0, &["branch", "--show-current"]).unwrap(), main);
    }

    #[test]
    fn rejects_folder_without_git() {
        let repo = TempRepo::new();
        assert!(read_history(&repo.0).unwrap_err().contains(".git"));
    }
    #[test]
    fn empty_repository_has_no_commits() {
        let repo = TempRepo::new();
        repo.init();
        assert!(read_history(&repo.0).unwrap().commits.is_empty());
    }
    #[test]
    fn paginates_history_with_metadata() {
        let repo = TempRepo::new();
        repo.init();
        for n in 0..65 {
            git(
                &repo.0,
                &[
                    "-c",
                    "user.name=Test Author",
                    "-c",
                    "user.email=test@example.com",
                    "-c",
                    "commit.gpgsign=false",
                    "commit",
                    "--allow-empty",
                    "-m",
                    &format!("Коммит {n}"),
                ],
            )
            .unwrap();
        }
        let history = read_history(&repo.0).unwrap();
        assert_eq!(history.commits.len(), PAGE_SIZE);
        assert!(history.has_more);
        assert_eq!(history.commits[0].parents[0], history.commits[1].hash);
        commit_file(&repo, "new", "Commit after first page");
        let tips: Vec<String> = history.branch_tips.values().cloned().collect();
        let second = read_branch_commit_page_at_tips(&repo.0, &history.tip, PAGE_SIZE, true, Some(&tips)).unwrap();
        assert_eq!(second.commits.len(), 15);
        assert!(!second.has_more);
        assert_eq!(second.commits[0].subject, "Коммит 14");
        assert_eq!(second.commits[14].subject, "Коммит 0");
        assert_eq!(history.commits[0].subject, "Коммит 64");
        assert_eq!(history.commits[9].subject, "Коммит 55");
        assert_eq!(history.commits[0].author, "Test Author");
        assert_eq!(history.commits[0].hash.len(), 40);
        assert!(!history.commits[0].date.is_empty());
    }
    pub(super) fn commit_file(repo: &TempRepo, contents: &str, message: &str) {
        std::fs::write(repo.0.join("file.txt"), contents).unwrap();
        git(&repo.0, &["add", "file.txt"]).unwrap();
        git(
            &repo.0,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.com",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-m",
                message,
            ],
        )
        .unwrap();
    }
    #[test]
    fn switching_branch_updates_files_and_history() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "original", "Base commit");
        let original = read_history(&repo.0).unwrap().current_branch;
        git(&repo.0, &["switch", "-c", "feature/test"]).unwrap();
        commit_file(&repo, "feature", "Feature commit");
        let history = switch_branch(&repo.0, &original).unwrap();
        assert_eq!(history.current_branch, original);
        assert_eq!(history.commits.iter().find(|commit| commit.hash == history.tip).unwrap().subject, "Base commit");
        assert!(history.branches.contains(&"feature/test".into()));
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "original"
        );
        assert_eq!(
            switch_branch(&repo.0, "feature/test").unwrap().commits[0].subject,
            "Feature commit"
        );
    }
    #[test]
    fn switching_rejects_unknown_branch_and_preserves_conflicting_edits() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "original", "Base commit");
        let original = read_history(&repo.0).unwrap().current_branch;
        git(&repo.0, &["switch", "-c", "feature"]).unwrap();
        commit_file(&repo, "feature", "Feature commit");
        std::fs::write(repo.0.join("file.txt"), "unsaved").unwrap();
        assert!(switch_branch(&repo.0, &original).is_err());
        assert!(switch_branch(&repo.0, "--detach").is_err());
        assert_eq!(read_history(&repo.0).unwrap().current_branch, "feature");
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "unsaved"
        );
    }
    #[test]
    fn history_includes_merge_parents_and_rejects_invalid_cursor() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "Base");
        let original = read_history(&repo.0).unwrap().current_branch;
        git(&repo.0, &["switch", "-c", "feature"]).unwrap();
        commit_file(&repo, "feature", "Feature");
        git(&repo.0, &["switch", &original]).unwrap();
        git(
            &repo.0,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.com",
                "-c",
                "commit.gpgsign=false",
                "merge",
                "--no-ff",
                "feature",
                "-m",
                "Merge feature",
            ],
        )
        .unwrap();
        let history = read_history(&repo.0).unwrap();
        assert_eq!(history.commits[0].parents.len(), 2);
        let files = read_commit_files(&repo.0, &history.tip).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "file.txt");
        assert!(
            read_file_diff(&repo.0, &history.tip, "file.txt")
                .unwrap()
                .patch
                .contains("+feature")
        );
        assert!(history.commits.last().unwrap().parents.is_empty());
        assert!(read_commit_page(&repo.0, "--all", 0).is_err());
    }
    #[test]
    fn recent_projects_persist_are_unique_and_keep_five_latest() {
        let folder = TempRepo::new();
        let file = folder.0.join("settings/recent-projects.json");
        assert!(load_recent(&file).unwrap().is_empty());
        for n in 0..7 {
            save_recent(&file, format!("/project/{n}")).unwrap();
        }
        assert_eq!(
            load_recent(&file).unwrap(),
            vec![
                "/project/6",
                "/project/5",
                "/project/4",
                "/project/3",
                "/project/2"
            ]
        );
        save_recent(&file, "/project/4".into()).unwrap();
        assert_eq!(
            load_recent(&file).unwrap(),
            vec![
                "/project/4",
                "/project/6",
                "/project/5",
                "/project/3",
                "/project/2"
            ]
        );
    }
    #[test]
    fn creates_branch_at_selected_commit_without_switching_or_changing_files() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "first", "First");
        let first = read_history(&repo.0).unwrap().tip;
        commit_file(&repo, "second", "Second");
        let before = read_history(&repo.0).unwrap();
        std::fs::write(repo.0.join("file.txt"), "local changes").unwrap();
        let after = create_branch_at_commit(&repo.0, "feature/from-first", &first).unwrap();
        assert_eq!(after.current_branch, before.current_branch);
        assert_eq!(after.tip, before.tip);
        assert_eq!(
            git(&repo.0, &["rev-parse", "refs/heads/feature/from-first"])
                .unwrap()
                .trim(),
            first
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "local changes"
        );
        assert!(create_branch_at_commit(&repo.0, "feature/from-first", &before.tip).is_err());
        assert!(create_branch_at_commit(&repo.0, "-invalid", &first).is_err());
        assert!(create_branch_at_commit(&repo.0, "feature/invalid-target", "WORKTREE").is_err());
        assert!(create_branch_at_commit(&repo.0, "feature/invalid-target", "not-a-sha").is_err());
    }

    #[test]
    fn creates_branch_at_head_and_preserves_working_changes() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "Base");
        let before = read_history(&repo.0).unwrap();
        std::fs::write(repo.0.join("file.txt"), "local changes").unwrap();
        let after = create_branch(&repo.0, "feature/new-screen").unwrap();
        assert_eq!(after.current_branch, "feature/new-screen");
        assert_eq!(after.tip, before.tip);
        assert!(after.branches.contains(&"feature/new-screen".into()));
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "local changes"
        );
    }
    #[test]
    fn rejects_invalid_duplicate_and_unborn_branch_creation() {
        let repo = TempRepo::new();
        repo.init();
        assert!(
            create_branch(&repo.0, "feature")
                .unwrap_err()
                .contains("первый коммит")
        );
        commit_file(&repo, "base", "Base");
        let before = read_history(&repo.0).unwrap();
        for name in [
            "",
            "invalid name",
            "-bad",
            "@{-1}",
            "trailing/",
            " feature",
            "a..b",
            &before.current_branch,
        ] {
            assert!(create_branch(&repo.0, name).is_err(), "accepted {name}");
        }
        let after = read_history(&repo.0).unwrap();
        assert_eq!(after.current_branch, before.current_branch);
        assert_eq!(after.branches, before.branches);
    }
    fn commit_all(repo: &TempRepo, message: &str) {
        git(&repo.0, &["add", "-A"]).unwrap();
        git(
            &repo.0,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.com",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-m",
                message,
            ],
        )
        .unwrap();
    }
    #[test]
    fn commit_files_and_diff_handle_root_renames_deletions_and_literal_paths() {
        let repo = TempRepo::new();
        repo.init();
        for file in ["a[1].txt", "old name.txt", "deleted.txt"] {
            std::fs::write(repo.0.join(file), format!("original {file}\n")).unwrap();
        }
        std::fs::write(repo.0.join("binary.dat"), [0, 1, 2]).unwrap();
        commit_all(&repo, "Initial files");
        let root = read_history(&repo.0).unwrap().tip;
        let files = read_commit_files(&repo.0, &root).unwrap();
        assert_eq!(files.len(), 4);
        assert!(files.iter().all(|file| file.status == "A"));
        assert!(
            read_file_diff(&repo.0, &root, "a[1].txt")
                .unwrap()
                .patch
                .contains("+original a[1].txt")
        );
        git(&repo.0, &["mv", "old name.txt", "new name.txt"]).unwrap();
        std::fs::remove_file(repo.0.join("deleted.txt")).unwrap();
        std::fs::write(repo.0.join("a[1].txt"), "committed change\n").unwrap();
        std::fs::write(repo.0.join("binary.dat"), [0, 3, 4]).unwrap();
        commit_all(&repo, "Changes");
        let tip = read_history(&repo.0).unwrap().tip;
        let files = read_commit_files(&repo.0, &tip).unwrap();
        assert_eq!(files.len(), 4);
        let renamed = files
            .iter()
            .find(|file| file.path == "new name.txt")
            .unwrap();
        assert_eq!(renamed.status, "R");
        assert_eq!(renamed.old_path.as_deref(), Some("old name.txt"));
        assert_eq!(
            files
                .iter()
                .find(|file| file.path == "deleted.txt")
                .unwrap()
                .status,
            "D"
        );
        std::fs::write(repo.0.join("a[1].txt"), "uncommitted change").unwrap();
        let patch = read_file_diff(&repo.0, &tip, "a[1].txt").unwrap().patch;
        assert!(patch.contains("-original a[1].txt"));
        assert!(patch.contains("+committed change"));
        assert!(!patch.contains("uncommitted"));
        assert!(
            read_file_diff(&repo.0, &tip, "new name.txt")
                .unwrap()
                .patch
                .contains("rename from old name.txt")
        );
        assert!(
            read_file_diff(&repo.0, &tip, "binary.dat")
                .unwrap()
                .patch
                .contains("Binary files")
        );
        assert!(read_file_diff(&repo.0, &tip, "not-in-commit.txt").is_err());
        assert!(read_commit_files(&repo.0, "--all").is_err());
    }
    #[test]
    fn empty_commit_has_no_changed_files() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "Base");
        git(
            &repo.0,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.com",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--allow-empty",
                "-m",
                "Empty",
            ],
        )
        .unwrap();
        assert!(
            read_commit_files(&repo.0, &read_history(&repo.0).unwrap().tip)
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn lists_tags_and_configured_remotes_without_network() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "Base");
        git(&repo.0, &["tag", "release/v1"]).unwrap();
        git(
            &repo.0,
            &["remote", "add", "origin", "https://example.com/repo.git"],
        )
        .unwrap();
        git(
            &repo.0,
            &[
                "remote",
                "add",
                "upstream",
                "https://example.com/upstream.git",
            ],
        )
        .unwrap();
        git(&repo.0, &["update-ref", "refs/remotes/origin/main", "HEAD"]).unwrap();
        git(
            &repo.0,
            &[
                "symbolic-ref",
                "refs/remotes/origin/HEAD",
                "refs/remotes/origin/main",
            ],
        )
        .unwrap();
        let history = read_history(&repo.0).unwrap();
        assert_eq!(history.tags, vec!["release/v1"]);
        assert_eq!(history.remotes.len(), 2);
        assert_eq!(history.remotes[0].name, "origin");
        assert_eq!(history.remotes[0].branches, vec!["main"]);
        assert_eq!(history.remotes[1].name, "upstream");
        assert!(history.remotes[1].branches.is_empty());
    }
    #[test]
    fn commit_details_include_full_message_and_files() {
        let repo = TempRepo::new();
        repo.init();
        std::fs::write(repo.0.join("file.txt"), "base").unwrap();
        commit_all(&repo, "Subject\n\nDetailed explanation\nSecond line");
        let tip = read_history(&repo.0).unwrap().tip;
        let details = read_commit_details(&repo.0, &tip).unwrap();
        assert_eq!(
            details.message,
            "Subject\n\nDetailed explanation\nSecond line"
        );
        assert_eq!(details.files.len(), 1);
        assert_eq!(details.files[0].path, "file.txt");
    }
    #[test]
    fn pull_and_push_sync_with_local_remote() {
        let remote = TempRepo::new();
        git(&remote.0, &["init", "--bare"]).unwrap();
        let first = TempRepo::new();
        first.init();
        commit_file(&first, "base", "Base");
        let branch = read_history(&first.0).unwrap().current_branch;
        git(
            &first.0,
            &["remote", "add", "origin", remote.0.to_str().unwrap()],
        )
        .unwrap();
        git(&first.0, &["push", "-u", "origin", &branch]).unwrap();
        let second = TempRepo::new();
        git(
            &second.0,
            &[
                "clone",
                "--branch",
                &branch,
                remote.0.to_str().unwrap(),
                ".",
            ],
        )
        .unwrap();
        commit_file(&first, "updated", "Pushed commit");
        let pushed = sync_repository(&first.0, "push").unwrap();
        let pulled = sync_repository(&second.0, "pull").unwrap();
        assert_eq!(pulled.tip, pushed.tip);
        assert_eq!(
            std::fs::read_to_string(second.0.join("file.txt")).unwrap(),
            "updated"
        );
        commit_file(&first, "first change", "Remote side");
        sync_repository(&first.0, "push").unwrap();
        commit_file(&second, "second change", "Local side");
        let before = read_history(&second.0).unwrap().tip;
        assert!(sync_repository(&second.0, "pull").is_err());
        assert!(sync_repository(&second.0, "push").is_err());
        assert_eq!(read_history(&second.0).unwrap().tip, before);
    }
    fn commit_operation_repo() -> TempRepo {
        let repo = TempRepo::new();
        repo.init();
        git(&repo.0, &["config", "user.name", "Test"]).unwrap();
        git(&repo.0, &["config", "user.email", "test@example.com"]).unwrap();
        git(&repo.0, &["config", "commit.gpgsign", "false"]).unwrap();
        commit_file(&repo, "base", "Base");
        repo
    }

    fn text_merge_conflict() -> (TempRepo, ProjectHistory) {
        let repo = commit_operation_repo();
        let base = read_history(&repo.0).unwrap();
        git(&repo.0, &["switch", "-c", "topic"]).unwrap();
        commit_file(&repo, "topic", "Topic");
        git(&repo.0, &["switch", &base.current_branch]).unwrap();
        commit_file(&repo, "main", "Main");
        let before = read_history(&repo.0).unwrap();
        assert!(git(&repo.0, &["merge", "--no-edit", "topic"]).is_err());
        (repo, before)
    }

    #[test]
    fn resolves_text_conflicts_with_snapshot_checks_and_completes_merge() {
        use conflicts::Resolution;
        let (repo, before) = text_merge_conflict();
        let history = read_history(&repo.0).unwrap();
        assert_eq!(history.conflicts.len(), 1);
        assert_eq!(history.operation.unwrap().kind, "merge");
        let file = conflicts::read(&repo.0, "file.txt").unwrap();
        assert_eq!(file.base.text.as_deref(), Some("base"));
        assert_eq!(file.ours.text.as_deref(), Some("main"));
        assert_eq!(file.theirs.text.as_deref(), Some("topic"));
        assert!(file.editable);
        assert!(file.working_text.as_ref().unwrap().contains("<<<<<<<"));
        assert!(
            conflicts::resolve(
                &repo.0,
                "file.txt",
                &file.token,
                Resolution::Manual {
                    content: file.working_text.unwrap()
                }
            )
            .is_err()
        );
        std::fs::write(repo.0.join("file.txt"), "external edit").unwrap();
        assert!(
            conflicts::resolve(
                &repo.0,
                "file.txt",
                &file.token,
                Resolution::Manual {
                    content: "stale overwrite".into()
                }
            )
            .is_err()
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "external edit"
        );
        let current = conflicts::read(&repo.0, "file.txt").unwrap();
        let resolved = conflicts::resolve(
            &repo.0,
            "file.txt",
            &current.token,
            Resolution::Manual {
                content: "combined result".into(),
            },
        )
        .unwrap();
        assert!(resolved.conflicts.is_empty());
        assert!(resolved.operation.as_ref().unwrap().staged);
        assert_eq!(
            git(&repo.0, &["show", ":file.txt"]).unwrap(),
            "combined result"
        );
        let completed = commit_ops::run(
            &repo.0,
            &before.tip,
            &before.current_branch,
            commit_ops::Action::Continue,
        )
        .unwrap();
        assert!(completed.operation.is_none());
        assert_eq!(completed.commits[0].parents.len(), 2);
        assert!(!completed.has_changes);
        assert!(conflicts::resolve(&repo.0, "file.txt", &current.token, Resolution::Ours).is_err());
        assert!(conflicts::read(&repo.0, "../file.txt").is_err());
    }

    #[test]
    fn resolves_modify_delete_and_binary_conflicts_without_corrupting_contents() {
        use conflicts::Resolution;
        let repo = commit_operation_repo();
        let base = read_history(&repo.0).unwrap();
        git(&repo.0, &["switch", "-c", "topic"]).unwrap();
        git(&repo.0, &["rm", "file.txt"]).unwrap();
        commit_all(&repo, "Delete file");
        git(&repo.0, &["switch", &base.current_branch]).unwrap();
        commit_file(&repo, "main edit", "Edit");
        std::fs::write(repo.0.join("untracked.md"), "keep").unwrap();
        assert!(git(&repo.0, &["merge", "--no-edit", "topic"]).is_err());
        let file = conflicts::read(&repo.0, "file.txt").unwrap();
        assert!(file.ours.exists);
        assert!(!file.theirs.exists);
        let deleted =
            conflicts::resolve(&repo.0, "file.txt", &file.token, Resolution::Theirs).unwrap();
        assert!(!repo.0.join("file.txt").exists());
        assert!(deleted.conflicts.is_empty());
        assert_eq!(
            std::fs::read_to_string(repo.0.join("untracked.md")).unwrap(),
            "keep"
        );
        let binary = commit_operation_repo();
        std::fs::write(binary.0.join("bin[1].dat"), [0, 1, 2, 255]).unwrap();
        commit_all(&binary, "Binary base");
        let initial = read_history(&binary.0).unwrap();
        git(&binary.0, &["switch", "-c", "topic"]).unwrap();
        std::fs::write(binary.0.join("bin[1].dat"), [0, 3, 4, 255]).unwrap();
        commit_all(&binary, "Binary topic");
        git(&binary.0, &["switch", &initial.current_branch]).unwrap();
        std::fs::write(binary.0.join("bin[1].dat"), [0, 5, 6, 255]).unwrap();
        commit_all(&binary, "Binary main");
        assert!(git(&binary.0, &["merge", "--no-edit", "topic"]).is_err());
        let file = conflicts::read(&binary.0, "bin[1].dat").unwrap();
        assert!(file.ours.binary && file.theirs.binary);
        assert!(!file.editable);
        assert!(
            conflicts::resolve(
                &binary.0,
                "bin[1].dat",
                &file.token,
                Resolution::Manual {
                    content: "wrong".into()
                }
            )
            .is_err()
        );
        let resolved =
            conflicts::resolve(&binary.0, "bin[1].dat", &file.token, Resolution::Theirs).unwrap();
        assert!(resolved.conflicts.is_empty());
        assert_eq!(
            std::fs::read(binary.0.join("bin[1].dat")).unwrap(),
            vec![0, 3, 4, 255]
        );
    }

    #[test]
    fn resolves_stash_conflicts_without_deleting_stash() {
        let repo = commit_operation_repo();
        std::fs::write(repo.0.join("file.txt"), "stash content").unwrap();
        let saved = stash::run(
            &repo.0,
            stash::StashAction::Save {
                message: "keep stash".into(),
                include_untracked: true,
            },
        )
        .unwrap();
        let id = saved.stashes[0].id.clone();
        commit_file(&repo, "new head", "New HEAD");
        assert!(
            stash::run(
                &repo.0,
                stash::StashAction::Apply {
                    id: id.clone(),
                    restore_index: false
                }
            )
            .is_err()
        );
        let history = read_history(&repo.0).unwrap();
        assert_eq!(history.conflicts.len(), 1);
        assert!(history.operation.is_none());
        let file = conflicts::read(&repo.0, "file.txt").unwrap();
        let resolved = conflicts::resolve(
            &repo.0,
            "file.txt",
            &file.token,
            conflicts::Resolution::Theirs,
        )
        .unwrap();
        assert!(resolved.conflicts.is_empty());
        assert_eq!(resolved.stashes[0].id, id);
        assert!(resolved.has_changes);
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "stash content"
        );
    }

    #[cfg(unix)]
    #[test]
    fn conflict_editor_does_not_follow_symlinks_outside_repository() {
        let (repo, _) = text_merge_conflict();
        let outside = TempRepo::new();
        std::fs::write(outside.0.join("private.txt"), "do not touch").unwrap();
        std::fs::remove_file(repo.0.join("file.txt")).unwrap();
        std::os::unix::fs::symlink(outside.0.join("private.txt"), repo.0.join("file.txt")).unwrap();
        let file = conflicts::read(&repo.0, "file.txt").unwrap();
        assert!(!file.editable);
        assert!(
            conflicts::resolve(
                &repo.0,
                "file.txt",
                &file.token,
                conflicts::Resolution::Manual {
                    content: "unsafe".into()
                }
            )
            .is_err()
        );
        conflicts::resolve(
            &repo.0,
            "file.txt",
            &file.token,
            conflicts::Resolution::Theirs,
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(outside.0.join("private.txt")).unwrap(),
            "do not touch"
        );
        assert!(
            !std::fs::symlink_metadata(repo.0.join("file.txt"))
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "topic"
        );
    }

    #[test]
    fn cherry_pick_revert_and_skip_redundant_commit_preserve_other_changes() {
        use commit_ops::Action;
        let repo = commit_operation_repo();
        let base = read_history(&repo.0).unwrap();
        git(&repo.0, &["switch", "-c", "topic"]).unwrap();
        std::fs::write(repo.0.join("feature.txt"), "feature").unwrap();
        commit_all(&repo, "Feature");
        let feature = read_history(&repo.0).unwrap().tip;
        git(&repo.0, &["switch", &base.current_branch]).unwrap();
        commit_file(&repo, "main change", "Main");
        let before = read_history(&repo.0).unwrap();
        std::fs::write(repo.0.join("file.txt"), "dirty").unwrap();
        assert!(
            commit_ops::run(
                &repo.0,
                &before.tip,
                &before.current_branch,
                Action::CherryPick {
                    commit: feature.clone(),
                    mainline: None
                }
            )
            .is_err()
        );
        assert_eq!(read_history(&repo.0).unwrap().tip, before.tip);
        std::fs::write(repo.0.join("file.txt"), "main change").unwrap();
        assert!(
            commit_ops::run(
                &repo.0,
                &base.tip,
                &before.current_branch,
                Action::CherryPick {
                    commit: feature.clone(),
                    mainline: None
                }
            )
            .is_err()
        );
        let picked = commit_ops::run(
            &repo.0,
            &before.tip,
            &before.current_branch,
            Action::CherryPick {
                commit: feature.clone(),
                mainline: None,
            },
        )
        .unwrap();
        assert_eq!(picked.commits[0].parents, vec![before.tip.clone()]);
        assert_eq!(
            std::fs::read_to_string(repo.0.join("feature.txt")).unwrap(),
            "feature"
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "main change"
        );
        assert!(
            commit_ops::run(
                &repo.0,
                &picked.tip,
                &picked.current_branch,
                Action::CherryPick {
                    commit: feature,
                    mainline: None
                }
            )
            .is_err()
        );
        let operation = read_history(&repo.0).unwrap().operation.unwrap();
        assert_eq!(operation.kind, "cherry-pick");
        assert_eq!(operation.conflicts, 0);
        assert!(!operation.staged);
        assert!(
            commit_ops::run(
                &repo.0,
                &picked.tip,
                &picked.current_branch,
                Action::Skip { confirmed: false }
            )
            .is_err()
        );
        let skipped = commit_ops::run(
            &repo.0,
            &picked.tip,
            &picked.current_branch,
            Action::Skip { confirmed: true },
        )
        .unwrap();
        assert!(skipped.operation.is_none());
        assert_eq!(skipped.tip, picked.tip);
        let reverted = commit_ops::run(
            &repo.0,
            &picked.tip,
            &picked.current_branch,
            Action::Revert {
                commit: picked.tip.clone(),
                mainline: None,
            },
        )
        .unwrap();
        assert!(!repo.0.join("feature.txt").exists());
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "main change"
        );
        assert_eq!(reverted.commits[0].parents, vec![picked.tip]);
    }

    #[test]
    fn signs_new_and_amended_commits_with_configured_ssh_key() {
        let repo = commit_operation_repo();
        let key = repo.0.join("test signing key");
        let output = std::process::Command::new("ssh-keygen").args(["-q", "-t", "ed25519", "-N", "", "-f"]).arg(&key).output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        let public_key = std::fs::read_to_string(key.with_extension("pub")).unwrap();
        let signers = repo.0.join("allowed-signers");
        std::fs::write(&signers, format!("test@example.com {public_key}")).unwrap();
        git(&repo.0, &["config", "gpg.format", "ssh"]).unwrap();
        git(&repo.0, &["config", "user.signingkey", key.to_str().unwrap()]).unwrap();
        git(&repo.0, &["config", "gpg.ssh.allowedSignersFile", signers.to_str().unwrap()]).unwrap();
        std::fs::write(repo.0.join("file.txt"), "staged").unwrap();
        set_file_staged(&repo.0, "file.txt", true).unwrap();
        std::fs::write(repo.0.join("file.txt"), "unstaged").unwrap();
        let options = commit_options::Options { sign: true };
        let signed = commit_staged_with_options(&repo.0, "Signed commit", &options).unwrap();
        git(&repo.0, &["verify-commit", &signed.tip]).unwrap();
        assert_eq!(std::fs::read_to_string(repo.0.join("file.txt")).unwrap(), "unstaged");
        let parents = signed.commits[0].parents.clone();
        let amended = commit_ops::run_with_options(&repo.0, &signed.tip, &signed.current_branch, commit_ops::Action::Amend { commit: signed.tip.clone(), message: "Amended signed message".into(), confirmed: true }, &options).unwrap();
        assert_ne!(amended.tip, signed.tip);
        assert_eq!(amended.commits[0].parents, parents);
        git(&repo.0, &["verify-commit", &amended.tip]).unwrap();
        assert_eq!(read_commit_details(&repo.0, &amended.tip).unwrap().message, "Amended signed message");
        assert_eq!(std::fs::read_to_string(repo.0.join("file.txt")).unwrap(), "unstaged");
    }

    #[test]
    fn signing_failure_preserves_head_and_staged_changes() {
        let repo = commit_operation_repo();
        let before = read_history(&repo.0).unwrap();
        git(&repo.0, &["config", "gpg.format", "ssh"]).unwrap();
        git(&repo.0, &["config", "user.signingkey", repo.0.join("missing-key").to_str().unwrap()]).unwrap();
        std::fs::write(repo.0.join("file.txt"), "staged").unwrap();
        set_file_staged(&repo.0, "file.txt", true).unwrap();
        let index = git(&repo.0, &["diff", "--cached"]).unwrap();
        assert!(commit_staged_with_options(&repo.0, "Should fail", &commit_options::Options { sign: true }).is_err());
        assert_eq!(read_history(&repo.0).unwrap().tip, before.tip);
        assert_eq!(git(&repo.0, &["diff", "--cached"]).unwrap(), index);
    }

    #[test]
    fn amend_requires_head_and_confirmation_and_preserves_unstaged_edits() {
        use commit_ops::Action;
        let repo = commit_operation_repo();
        let before = read_history(&repo.0).unwrap();
        std::fs::write(repo.0.join("file.txt"), "staged").unwrap();
        git(&repo.0, &["add", "file.txt"]).unwrap();
        std::fs::write(repo.0.join("file.txt"), "unstaged").unwrap();
        std::fs::write(repo.0.join("new.txt"), "untracked").unwrap();
        assert!(
            commit_ops::run(
                &repo.0,
                &before.tip,
                &before.current_branch,
                Action::Amend {
                    commit: before.tip.clone(),
                    message: "New".into(),
                    confirmed: false
                }
            )
            .is_err()
        );
        assert!(
            commit_ops::run(
                &repo.0,
                &before.tip,
                &before.current_branch,
                Action::Amend {
                    commit: "0".repeat(40),
                    message: "New".into(),
                    confirmed: true
                }
            )
            .is_err()
        );
        let after = commit_ops::run(
            &repo.0,
            &before.tip,
            &before.current_branch,
            Action::Amend {
                commit: before.tip.clone(),
                message: "Revised\n\nDetails".into(),
                confirmed: true,
            },
        )
        .unwrap();
        assert_ne!(after.tip, before.tip);
        assert!(after.commits[0].parents.is_empty());
        assert_eq!(
            read_commit_details(&repo.0, &after.tip).unwrap().message,
            "Revised\n\nDetails"
        );
        assert_eq!(git(&repo.0, &["show", "HEAD:file.txt"]).unwrap(), "staged");
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "unstaged"
        );
        assert!(repo.0.join("new.txt").exists());
        assert!(after.has_changes);
    }

    #[test]
    fn commit_operation_conflicts_can_abort_or_continue_and_revert_can_abort() {
        use commit_ops::Action;
        let repo = commit_operation_repo();
        let base = read_history(&repo.0).unwrap();
        git(&repo.0, &["switch", "-c", "topic"]).unwrap();
        commit_file(&repo, "topic change", "Topic");
        let topic = read_history(&repo.0).unwrap().tip;
        git(&repo.0, &["switch", &base.current_branch]).unwrap();
        commit_file(&repo, "main change", "Main");
        let before = read_history(&repo.0).unwrap();
        assert!(
            commit_ops::run(
                &repo.0,
                &before.tip,
                &before.current_branch,
                Action::CherryPick {
                    commit: topic.clone(),
                    mainline: None
                }
            )
            .is_err()
        );
        let operation = read_history(&repo.0).unwrap().operation.unwrap();
        assert_eq!(operation.conflicts, 1);
        assert!(
            commit_ops::run(
                &repo.0,
                &before.tip,
                &before.current_branch,
                Action::Continue
            )
            .is_err()
        );
        assert!(
            commit_ops::run(
                &repo.0,
                &before.tip,
                &before.current_branch,
                Action::Abort { confirmed: false }
            )
            .is_err()
        );
        let aborted = commit_ops::run(
            &repo.0,
            &before.tip,
            &before.current_branch,
            Action::Abort { confirmed: true },
        )
        .unwrap();
        assert!(aborted.operation.is_none());
        assert_eq!(aborted.tip, before.tip);
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "main change"
        );
        assert!(
            commit_ops::run(
                &repo.0,
                &before.tip,
                &before.current_branch,
                Action::CherryPick {
                    commit: topic.clone(),
                    mainline: None
                }
            )
            .is_err()
        );
        std::fs::write(repo.0.join("file.txt"), "resolved").unwrap();
        git(&repo.0, &["add", "file.txt"]).unwrap();
        let continued = commit_ops::run(
            &repo.0,
            &before.tip,
            &before.current_branch,
            Action::Continue,
        )
        .unwrap();
        assert!(continued.operation.is_none());
        assert_ne!(continued.tip, before.tip);
        assert!(
            commit_ops::run(
                &repo.0,
                &continued.tip,
                &continued.current_branch,
                Action::Revert {
                    commit: topic,
                    mainline: None
                }
            )
            .is_err()
        );
        assert_eq!(
            read_history(&repo.0).unwrap().operation.unwrap().kind,
            "revert"
        );
        let restored = commit_ops::run(
            &repo.0,
            &continued.tip,
            &continued.current_branch,
            Action::Abort { confirmed: true },
        )
        .unwrap();
        assert!(restored.operation.is_none());
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "resolved"
        );
    }

    #[test]
    fn merge_commit_operations_require_an_explicit_valid_parent() {
        use commit_ops::Action;
        let repo = commit_operation_repo();
        let base = read_history(&repo.0).unwrap();
        git(&repo.0, &["switch", "-c", "topic"]).unwrap();
        std::fs::write(repo.0.join("topic.txt"), "topic").unwrap();
        commit_all(&repo, "Topic");
        git(&repo.0, &["switch", &base.current_branch]).unwrap();
        std::fs::write(repo.0.join("main.txt"), "main").unwrap();
        commit_all(&repo, "Main");
        let parent = read_history(&repo.0).unwrap().tip;
        git(&repo.0, &["merge", "--no-ff", "--no-edit", "topic"]).unwrap();
        let merge = read_history(&repo.0).unwrap().tip;
        git(&repo.0, &["switch", "-c", "target", &parent]).unwrap();
        let target = read_history(&repo.0).unwrap();
        for mainline in [None, Some(0), Some(3)] {
            assert!(
                commit_ops::run(
                    &repo.0,
                    &target.tip,
                    &target.current_branch,
                    Action::CherryPick {
                        commit: merge.clone(),
                        mainline
                    }
                )
                .is_err()
            );
        }
        let picked = commit_ops::run(
            &repo.0,
            &target.tip,
            &target.current_branch,
            Action::CherryPick {
                commit: merge.clone(),
                mainline: Some(1),
            },
        )
        .unwrap();
        assert!(repo.0.join("topic.txt").exists());
        assert!(repo.0.join("main.txt").exists());
        let reverted = commit_ops::run(
            &repo.0,
            &picked.tip,
            &picked.current_branch,
            Action::Revert {
                commit: merge,
                mainline: Some(1),
            },
        )
        .unwrap();
        assert!(!repo.0.join("topic.txt").exists());
        assert!(repo.0.join("main.txt").exists());
        assert!(reverted.operation.is_none());
    }

    #[test]
    fn publishes_selected_branch_to_selected_remote_and_pushes_only_its_upstream() {
        let origin = TempRepo::new();
        git(&origin.0, &["init", "--bare"]).unwrap();
        let backup = TempRepo::new();
        git(&backup.0, &["init", "--bare"]).unwrap();
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "Base");
        git(
            &repo.0,
            &["remote", "add", "origin", origin.0.to_str().unwrap()],
        )
        .unwrap();
        git(
            &repo.0,
            &["remote", "add", "backup", backup.0.to_str().unwrap()],
        )
        .unwrap();
        let before = read_history(&repo.0).unwrap();
        std::fs::write(repo.0.join("file.txt"), "staged change").unwrap();
        git(&repo.0, &["add", "file.txt"]).unwrap();
        std::fs::write(repo.0.join("file.txt"), "unstaged change").unwrap();
        let index = git(&repo.0, &["diff", "--cached"]).unwrap();
        let published =
            tracking::publish(&repo.0, &before.current_branch, "backup", "review/feature").unwrap();
        assert_eq!(published.tip, before.tip);
        assert_eq!(published.current_branch, before.current_branch);
        assert_eq!(
            published.sync.upstream.as_deref(),
            Some("backup/review/feature")
        );
        assert_eq!(published.sync.ahead, 0);
        assert_eq!(published.sync.behind, 0);
        assert_eq!(
            git(&backup.0, &["rev-parse", "refs/heads/review/feature"])
                .unwrap()
                .trim(),
            before.tip
        );
        assert!(
            git(
                &origin.0,
                &["for-each-ref", "--format=%(refname)", "refs/heads/"]
            )
            .unwrap()
            .is_empty()
        );
        assert_eq!(git(&repo.0, &["diff", "--cached"]).unwrap(), index);
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "unstaged change"
        );
        git(&backup.0, &["update-ref", "refs/heads/other", &before.tip]).unwrap();
        commit_file(&repo, "next commit", "Next");
        let next = read_history(&repo.0).unwrap().tip;
        git(&repo.0, &["branch", "other", &next]).unwrap();
        git(&repo.0, &["config", "push.default", "matching"]).unwrap();
        git(
            &repo.0,
            &[
                "config",
                "remote.backup.push",
                "+refs/heads/other:refs/heads/other",
            ],
        )
        .unwrap();
        sync_repository(&repo.0, "push").unwrap();
        assert_eq!(
            git(&backup.0, &["rev-parse", "refs/heads/review/feature"])
                .unwrap()
                .trim(),
            next
        );
        assert_eq!(
            git(&backup.0, &["rev-parse", "refs/heads/other"])
                .unwrap()
                .trim(),
            before.tip
        );
        let source = TempRepo::new();
        git(
            &source.0,
            &[
                "clone",
                "--branch",
                "review/feature",
                backup.0.to_str().unwrap(),
                ".",
            ],
        )
        .unwrap();
        commit_file(&source, "server commit", "Server");
        git(&source.0, &["push"]).unwrap();
        let server_tip = read_history(&source.0).unwrap().tip;
        commit_file(&repo, "local divergence", "Local");
        let local_tip = read_history(&repo.0).unwrap().tip;
        assert!(
            tracking::publish(&repo.0, &before.current_branch, "backup", "review/feature").is_err()
        );
        assert_eq!(
            git(&backup.0, &["rev-parse", "refs/heads/review/feature"])
                .unwrap()
                .trim(),
            server_tip
        );
        assert_eq!(read_history(&repo.0).unwrap().tip, local_tip);
    }

    #[test]
    fn sets_upstream_without_changing_files_and_pulls_from_differently_named_branch() {
        let remote = TempRepo::new();
        git(&remote.0, &["init", "--bare"]).unwrap();
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "Base");
        git(
            &repo.0,
            &["remote", "add", "origin", remote.0.to_str().unwrap()],
        )
        .unwrap();
        git(&repo.0, &["push", "origin", "HEAD:refs/heads/trunk"]).unwrap();
        git(&repo.0, &["fetch", "origin"]).unwrap();
        let before = read_history(&repo.0).unwrap();
        std::fs::write(repo.0.join("untracked.md"), "keep").unwrap();
        let configured =
            tracking::set_upstream(&repo.0, &before.current_branch, "origin", "trunk").unwrap();
        assert_eq!(configured.tip, before.tip);
        assert_eq!(configured.current_branch, before.current_branch);
        assert_eq!(configured.sync.upstream.as_deref(), Some("origin/trunk"));
        assert_eq!(
            std::fs::read_to_string(repo.0.join("untracked.md")).unwrap(),
            "keep"
        );
        assert!(tracking::set_upstream(&repo.0, "stale-branch", "origin", "trunk").is_err());
        assert!(
            tracking::set_upstream(&repo.0, &before.current_branch, "origin", "missing").is_err()
        );
        assert!(tracking::publish(&repo.0, &before.current_branch, "missing", "trunk").is_err());
        assert!(tracking::publish(&repo.0, &before.current_branch, "origin", "--bad").is_err());
        let source = TempRepo::new();
        git(
            &source.0,
            &[
                "clone",
                "--branch",
                "trunk",
                remote.0.to_str().unwrap(),
                ".",
            ],
        )
        .unwrap();
        commit_file(&source, "new remote content", "Remote update");
        git(&source.0, &["push"]).unwrap();
        let pulled = sync_repository(&repo.0, "pull").unwrap();
        assert_eq!(pulled.current_branch, before.current_branch);
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "new remote content"
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("untracked.md")).unwrap(),
            "keep"
        );
        let log = terminal_log::latest(&repo.0).unwrap().unwrap();
        assert!(log.command.starts_with("git pull --ff-only"));
        git(&repo.0, &["switch", "--detach", &pulled.tip]).unwrap();
        assert!(tracking::publish(&repo.0, &before.current_branch, "origin", "trunk").is_err());
        let empty = TempRepo::new();
        empty.init();
        assert!(tracking::publish(&empty.0, "main", "origin", "trunk").is_err());
    }

    #[test]
    fn stash_all_with_default_message_preserves_every_file_and_head() {
        let repo = TempRepo::new();
        repo.init();
        git(&repo.0, &["config", "user.name", "Test"]).unwrap();
        git(&repo.0, &["config", "user.email", "test@example.com"]).unwrap();
        git(&repo.0, &["config", "commit.gpgsign", "false"]).unwrap();
        commit_file(&repo, "base", "Base");
        let head = read_history(&repo.0).unwrap().tip;
        std::fs::write(repo.0.join("file.txt"), "staged").unwrap();
        git(&repo.0, &["add", "file.txt"]).unwrap();
        std::fs::write(repo.0.join("file.txt"), "unstaged").unwrap();
        std::fs::create_dir(repo.0.join("new folder")).unwrap();
        std::fs::write(repo.0.join("new folder/new file.txt"), "untracked").unwrap();
        let saved = stash::run(&repo.0, stash::StashAction::Save { message: String::new(), include_untracked: true }).unwrap();
        assert!(!saved.has_changes);
        assert_eq!(saved.tip, head);
        assert_eq!(saved.stashes.len(), 1);
        let id = saved.stashes[0].id.clone();
        assert_eq!(stash::details(&repo.0, &id).unwrap().files.len(), 2);
        stash::run(&repo.0, stash::StashAction::Apply { id, restore_index: true }).unwrap();
        assert_eq!(git(&repo.0, &["show", ":file.txt"]).unwrap(), "staged");
        assert_eq!(std::fs::read_to_string(repo.0.join("file.txt")).unwrap(), "unstaged");
        assert_eq!(std::fs::read_to_string(repo.0.join("new folder/new file.txt")).unwrap(), "untracked");
        assert_eq!(read_history(&repo.0).unwrap().tip, head);
    }

    #[test]
    fn stash_restores_staged_unstaged_and_untracked_without_dropping_saved_work() {
        use stash::StashAction;
        let repo = TempRepo::new();
        repo.init();
        git(&repo.0, &["config", "user.name", "Test"]).unwrap();
        git(&repo.0, &["config", "user.email", "test@example.com"]).unwrap();
        git(&repo.0, &["config", "commit.gpgsign", "false"]).unwrap();
        commit_file(&repo, "base", "Base");
        std::fs::write(repo.0.join(".gitignore"), "ignored.tmp\n").unwrap();
        commit_all(&repo, "Ignore generated file");
        let head = read_history(&repo.0).unwrap().tip;
        std::fs::write(repo.0.join("file.txt"), "staged").unwrap();
        git(&repo.0, &["add", "file.txt"]).unwrap();
        std::fs::write(repo.0.join("file.txt"), "unstaged").unwrap();
        std::fs::write(repo.0.join("new file.md"), "new content").unwrap();
        std::fs::write(repo.0.join("ignored.tmp"), "ignored").unwrap();
        let index = git(&repo.0, &["diff", "--cached"]).unwrap();
        let saved = stash::run(
            &repo.0,
            StashAction::Save {
                message: "Work in progress".into(),
                include_untracked: true,
            },
        )
        .unwrap();
        assert_eq!(saved.tip, head);
        assert!(!saved.has_changes);
        assert_eq!(saved.stashes.len(), 1);
        assert!(saved.stashes[0].message.contains("Work in progress"));
        assert!(!saved.stashes[0].date.is_empty());
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "base"
        );
        assert!(!repo.0.join("new file.md").exists());
        assert!(repo.0.join("ignored.tmp").exists());
        let id = saved.stashes[0].id.clone();
        let details = stash::details(&repo.0, &id).unwrap();
        assert_eq!(details.files.len(), 2);
        assert!(details.files.iter().any(|file| file.path == "new file.md"));
        assert!(details.files.iter().any(|file| file.path == "file.txt"));
        assert!(!repo.0.join("new file.md").exists());
        assert!(git(&repo.0, &["diff", "--cached"]).unwrap().is_empty());

        let applied = stash::run(
            &repo.0,
            StashAction::Apply {
                id: id.clone(),
                restore_index: true,
            },
        )
        .unwrap();
        assert_eq!(applied.tip, head);
        assert!(applied.has_changes);
        assert_eq!(applied.stashes.len(), 1);
        assert_eq!(git(&repo.0, &["diff", "--cached"]).unwrap(), index);
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "unstaged"
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("new file.md")).unwrap(),
            "new content"
        );
        let log = terminal_log::latest(&repo.0).unwrap().unwrap();
        assert!(log.command.starts_with("git stash apply --index "));
        assert_eq!(log.status, "success");
        assert!(
            stash::run(
                &repo.0,
                StashAction::Drop {
                    id: id.clone(),
                    confirmed: false
                }
            )
            .is_err()
        );
        let next = stash::run(
            &repo.0,
            StashAction::Save {
                message: "Newer stash".into(),
                include_untracked: true,
            },
        )
        .unwrap();
        assert_eq!(next.stashes.len(), 2);
        let newer_id = next.stashes[0].id.clone();
        assert_ne!(id, newer_id);
        let dropped = stash::run(
            &repo.0,
            StashAction::Drop {
                id: id.clone(),
                confirmed: true,
            },
        )
        .unwrap();
        assert_eq!(dropped.stashes.len(), 1);
        assert_eq!(dropped.stashes[0].id, newer_id);
        assert!(
            stash::run(
                &repo.0,
                StashAction::Drop {
                    id,
                    confirmed: true
                }
            )
            .is_err()
        );
        assert_eq!(stash::list(&repo.0).unwrap().len(), 1);
        let applied = stash::run(
            &repo.0,
            StashAction::Apply {
                id: newer_id,
                restore_index: false,
            },
        )
        .unwrap();
        assert!(applied.has_changes);
        assert_eq!(applied.stashes.len(), 1);
        assert!(
            git(&repo.0, &["diff", "--cached", "--name-only"])
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn stash_preserves_untracked_when_excluded_and_saved_object_after_conflict() {
        use stash::StashAction;
        let repo = TempRepo::new();
        repo.init();
        git(&repo.0, &["config", "user.name", "Test"]).unwrap();
        git(&repo.0, &["config", "user.email", "test@example.com"]).unwrap();
        git(&repo.0, &["config", "commit.gpgsign", "false"]).unwrap();
        std::fs::write(repo.0.join("new.txt"), "untracked").unwrap();
        assert!(
            stash::run(
                &repo.0,
                StashAction::Save {
                    message: String::new(),
                    include_untracked: true
                }
            )
            .is_err()
        );
        commit_file(&repo, "base", "Base");
        assert!(
            stash::run(
                &repo.0,
                StashAction::Save {
                    message: String::new(),
                    include_untracked: false
                }
            )
            .is_err()
        );
        std::fs::write(repo.0.join("file.txt"), "stashed edit").unwrap();
        let saved = stash::run(
            &repo.0,
            StashAction::Save {
                message: String::new(),
                include_untracked: false,
            },
        )
        .unwrap();
        assert!(saved.has_changes);
        assert!(repo.0.join("new.txt").exists());
        assert_eq!(saved.stashes.len(), 1);
        let id = saved.stashes[0].id.clone();
        commit_file(&repo, "conflicting edit", "Change the same line");
        assert!(
            stash::run(
                &repo.0,
                StashAction::Apply {
                    id: id.clone(),
                    restore_index: false
                }
            )
            .is_err()
        );
        assert_eq!(stash::list(&repo.0).unwrap()[0].id, id);
        assert!(
            read_worktree_files(&repo.0)
                .unwrap()
                .iter()
                .any(|file| file.status == "U")
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("new.txt")).unwrap(),
            "untracked"
        );
        assert_eq!(
            terminal_log::latest(&repo.0).unwrap().unwrap().status,
            "error"
        );
        assert!(
            stash::run(
                &repo.0,
                StashAction::Drop {
                    id: "--all".into(),
                    confirmed: true
                }
            )
            .is_err()
        );
    }

    #[test]
    fn history_search_filters_all_pages_by_message_author_path_and_sha() {
        use history_search::HistoryFilter;
        let repo = TempRepo::new();
        repo.init();
        std::fs::create_dir_all(repo.0.join("src")).unwrap();
        let mut oldest = String::new();
        for n in 0..PAGE_SIZE + 4 {
            std::fs::write(repo.0.join("src/a[1].txt"), n.to_string()).unwrap();
            git(&repo.0, &["add", "--all"]).unwrap();
            git(
                &repo.0,
                &[
                    "-c",
                    "user.name=Alpha[1]",
                    "-c",
                    "user.email=alpha@example.com",
                    "-c",
                    "commit.gpgsign=false",
                    "commit",
                    "-m",
                    &format!("2026 Fix [ui] {n}"),
                ],
            )
            .unwrap();
            if n == 0 {
                oldest = git(&repo.0, &["rev-parse", "HEAD"])
                    .unwrap()
                    .trim()
                    .to_string();
            }
        }
        for n in 0..20 {
            commit_file(&repo, &format!("noise {n}"), "Other changes");
        }
        let snapshot = read_history(&repo.0).unwrap();
        assert!(!snapshot.commits.iter().any(|commit| commit.hash == oldest));
        let filter = HistoryFilter {
            text: "fIX [UI]".into(),
            sha: String::new(),
            author: "alpha[1]".into(),
            file: "src/a[1].txt".into(),
        };
        let first = history_search::page(&repo.0, &snapshot.tip, None, "all", &filter, 0).unwrap();
        assert_eq!(first.commits.len(), PAGE_SIZE);
        assert!(first.has_more);
        assert!(
            first
                .commits
                .iter()
                .all(|commit| commit.author == "Alpha[1]")
        );
        let second =
            history_search::page(&repo.0, &snapshot.tip, None, "all", &filter, PAGE_SIZE).unwrap();
        assert_eq!(second.commits.len(), 4);
        assert!(!second.has_more);
        assert_eq!(second.commits.last().unwrap().hash, oldest);
        let sha = HistoryFilter {
            text: oldest[..8].to_uppercase(),
            ..filter.clone()
        };
        let result = history_search::page(&repo.0, &snapshot.tip, None, "all", &sha, 0).unwrap();
        assert_eq!(result.commits.len(), 1);
        assert_eq!(result.commits[0].hash, oldest);
        let explicit_sha = HistoryFilter {
            sha: oldest[..8].to_uppercase(),
            ..filter.clone()
        };
        assert_eq!(
            history_search::page(&repo.0, &snapshot.tip, None, "all", &explicit_sha, 0)
                .unwrap()
                .commits[0]
                .hash,
            oldest
        );
        let wrong_text = HistoryFilter {
            text: "No matching message".into(),
            ..explicit_sha.clone()
        };
        assert!(
            history_search::page(&repo.0, &snapshot.tip, None, "all", &wrong_text, 0)
                .unwrap()
                .commits
                .is_empty()
        );
        let short_sha = HistoryFilter {
            sha: "ab".into(),
            ..filter.clone()
        };
        assert!(
            history_search::page(&repo.0, &snapshot.tip, None, "all", &short_sha, 0)
                .unwrap()
                .commits
                .is_empty()
        );
        let numeric_message = HistoryFilter {
            text: "2026".into(),
            ..filter.clone()
        };
        assert_eq!(
            history_search::page(
                &repo.0,
                &snapshot.tip,
                None,
                "all",
                &numeric_message,
                PAGE_SIZE
            )
            .unwrap()
            .commits
            .len(),
            4
        );
        let folder = HistoryFilter {
            file: "src".into(),
            ..Default::default()
        };
        assert!(
            history_search::page(&repo.0, &snapshot.tip, None, "all", &folder, 0)
                .unwrap()
                .has_more
        );
        let missing_author = HistoryFilter {
            author: "Nobody".into(),
            ..filter.clone()
        };
        assert!(
            history_search::page(&repo.0, &snapshot.tip, None, "all", &missing_author, 0)
                .unwrap()
                .commits
                .is_empty()
        );
        let wrong_file = HistoryFilter {
            file: "src/a1.txt".into(),
            ..filter.clone()
        };
        assert!(
            history_search::page(&repo.0, &snapshot.tip, None, "all", &wrong_file, 0)
                .unwrap()
                .commits
                .is_empty()
        );
        for file in ["../file.txt", "/file.txt"] {
            assert!(
                history_search::page(
                    &repo.0,
                    &snapshot.tip,
                    None,
                    "all",
                    &HistoryFilter {
                        file: file.into(),
                        ..Default::default()
                    },
                    0
                )
                .is_err()
            );
        }
        assert!(history_search::page(&repo.0, "--all", None, "all", &filter, 0).is_err());
        assert!(
            history_search::page(
                &repo.0,
                &snapshot.tip,
                None,
                "all",
                &HistoryFilter {
                    text: "bad\0value".into(),
                    ..Default::default()
                },
                0
            )
            .is_err()
        );
        commit_file(&repo, "newer", "2026 Fix [ui] after snapshot");
        assert_eq!(
            history_search::page(&repo.0, &snapshot.tip, None, "all", &filter, PAGE_SIZE)
                .unwrap()
                .commits
                .len(),
            4
        );
    }

    #[test]
    fn fetch_reports_divergence_and_preserves_head_index_and_worktree() {
        let remote = TempRepo::new();
        git(&remote.0, &["init", "--bare"]).unwrap();
        let source = TempRepo::new();
        source.init();
        commit_file(&source, "base", "Base");
        let initial = read_history(&source.0).unwrap();
        assert!(initial.sync.upstream.is_none());
        git(
            &source.0,
            &["remote", "add", "origin", remote.0.to_str().unwrap()],
        )
        .unwrap();
        git(
            &source.0,
            &["push", "-u", "origin", &initial.current_branch],
        )
        .unwrap();
        let local = TempRepo::new();
        git(
            &local.0,
            &[
                "clone",
                "--branch",
                &initial.current_branch,
                remote.0.to_str().unwrap(),
                ".",
            ],
        )
        .unwrap();
        assert_eq!(read_history(&local.0).unwrap().sync.ahead, 0);
        assert_eq!(read_history(&local.0).unwrap().sync.behind, 0);
        commit_file(&local, "local commit", "Outgoing commit");
        for n in 0..PAGE_SIZE + 3 {
            git(
                &source.0,
                &[
                    "-c",
                    "user.name=Test",
                    "-c",
                    "user.email=test@example.com",
                    "-c",
                    "commit.gpgsign=false",
                    "commit",
                    "--allow-empty",
                    "-m",
                    &format!("Incoming {n}"),
                ],
            )
            .unwrap();
        }
        git(&source.0, &["push"]).unwrap();
        std::fs::write(local.0.join("file.txt"), "staged local change").unwrap();
        git(&local.0, &["add", "file.txt"]).unwrap();
        std::fs::write(local.0.join("file.txt"), "unstaged local change").unwrap();
        std::fs::write(local.0.join("untracked.txt"), "keep").unwrap();
        let before = read_history(&local.0).unwrap();
        let index = git(&local.0, &["diff", "--cached"]).unwrap();
        let fetched = sync_repository(&local.0, "fetch").unwrap();
        assert_eq!(fetched.tip, before.tip);
        assert_eq!(fetched.current_branch, before.current_branch);
        assert_eq!(git(&local.0, &["diff", "--cached"]).unwrap(), index);
        assert_eq!(
            std::fs::read_to_string(local.0.join("file.txt")).unwrap(),
            "unstaged local change"
        );
        assert_eq!(
            std::fs::read_to_string(local.0.join("untracked.txt")).unwrap(),
            "keep"
        );
        assert_eq!(fetched.sync.ahead, 1);
        assert_eq!(fetched.sync.behind, PAGE_SIZE + 3);
        assert_eq!(
            fetched.sync.upstream,
            Some(format!("origin/{}", initial.current_branch))
        );
        let remote_tip = fetched.sync.remote_tip.clone().unwrap();
        let mut tree_commits = fetched.commits.clone();
        let mut more = fetched.has_more;
        while more {
            let page = read_commit_page(&local.0, &fetched.tip, tree_commits.len()).unwrap();
            more = page.has_more;
            tree_commits.extend(page.commits);
        }
        assert!(tree_commits.iter().any(|commit| commit.hash == remote_tip));
        assert!(tree_commits.iter().any(|commit| commit.hash == fetched.tip));
        assert_eq!(tree_commits.iter().map(|commit| &commit.hash).collect::<std::collections::HashSet<_>>().len(), tree_commits.len());
        let remote_search = history_search::page(
            &local.0, &fetched.tip, Some(&remote_tip), "all",
            &history_search::HistoryFilter { sha: remote_tip[..8].into(), ..Default::default() }, 0,
        ).unwrap();
        assert_eq!(remote_search.commits.len(), 1);
        assert_eq!(remote_search.commits[0].hash, remote_tip);
        let first = sync_status::page(&local.0, &fetched.tip, &remote_tip, "incoming", 0).unwrap();
        assert_eq!(first.commits.len(), PAGE_SIZE);
        assert!(first.has_more);
        assert_eq!(
            first.commits[0].subject,
            format!("Incoming {}", PAGE_SIZE + 2)
        );
        let outgoing =
            sync_status::page(&local.0, &fetched.tip, &remote_tip, "outgoing", 0).unwrap();
        assert_eq!(outgoing.commits.len(), 1);
        assert_eq!(outgoing.commits[0].subject, "Outgoing commit");
        let filter = history_search::HistoryFilter {
            text: "Incoming 1".into(),
            ..Default::default()
        };
        let incoming_search = history_search::page(
            &local.0,
            &fetched.tip,
            Some(&remote_tip),
            "incoming",
            &filter,
            0,
        )
        .unwrap();
        assert_eq!(incoming_search.commits.len(), 11);
        assert!(
            history_search::page(
                &local.0,
                &fetched.tip,
                Some(&remote_tip),
                "outgoing",
                &filter,
                0
            )
            .unwrap()
            .commits
            .is_empty()
        );

        let second =
            sync_status::page(&local.0, &fetched.tip, &remote_tip, "incoming", PAGE_SIZE).unwrap();
        assert_eq!(second.commits.len(), 3);
        assert!(!second.has_more);
        assert!(sync_status::page(&local.0, "--all", &remote_tip, "incoming", 0).is_err());
        assert!(sync_status::page(&local.0, &fetched.tip, &remote_tip, "invalid", 0).is_err());
        let log = terminal_log::latest(&local.0).unwrap().unwrap();
        assert_eq!(log.command, "git fetch --all --prune");
        assert_eq!(log.status, "success");
        git(&local.0, &["switch", "--detach", &fetched.tip]).unwrap();
        let detached = sync_repository(&local.0, "fetch").unwrap();
        assert!(detached.current_branch.is_empty());
        assert!(detached.sync.upstream.is_none());
        let timestamp = detached.last_fetch.expect("successful fetch records its time");
        assert_eq!(read_history(&local.0).unwrap().last_fetch, Some(timestamp));
        git(&local.0, &["remote", "set-url", "origin", "/git-ui-missing-remote"]).unwrap();
        assert!(sync_repository(&local.0, "fetch").is_err());
        assert_eq!(read_history(&local.0).unwrap().last_fetch, Some(timestamp));
    }

    #[test]
    fn sync_rejects_repository_without_remote() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "Base");
        assert!(
            sync_repository(&repo.0, "pull")
                .unwrap_err()
                .contains("remote")
        );
        assert!(sync_repository(&repo.0, "push").is_err());
        assert!(sync_repository(&repo.0, "fetch").is_err());
    }
    #[test]
    fn creates_tags_and_remotes_and_rejects_invalid_or_duplicate_names() {
        let repo = TempRepo::new();
        repo.init();
        assert!(create_tag(&repo.0, "v1").is_err());
        assert_eq!(
            add_remote(&repo.0, "origin", "/local/repository.git")
                .unwrap()
                .remotes[0]
                .name,
            "origin"
        );
        assert!(add_remote(&repo.0, "origin", "/other.git").is_err());
        assert!(add_remote(&repo.0, "bad name", "/other.git").is_err());
        assert!(add_remote(&repo.0, "upstream", "").is_err());
        commit_file(&repo, "base", "Base");
        let tip = read_history(&repo.0).unwrap().tip;
        assert_eq!(
            create_tag(&repo.0, "release/v1").unwrap().tags,
            vec!["release/v1"]
        );
        assert_eq!(
            git(&repo.0, &["rev-parse", "refs/tags/release/v1"])
                .unwrap()
                .trim(),
            tip
        );
        assert!(create_tag(&repo.0, "release/v1").is_err());
        assert!(create_tag(&repo.0, "bad name").is_err());
        assert!(create_tag(&repo.0, "--force").is_err());
    }
    #[test]
    fn uncommitted_changes_include_staged_unstaged_and_new_files() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base\n", "Base");
        assert!(!read_history(&repo.0).unwrap().has_changes);
        std::fs::write(repo.0.join("file.txt"), "staged\n").unwrap();
        git(&repo.0, &["add", "file.txt"]).unwrap();
        std::fs::write(repo.0.join("file.txt"), "working\n").unwrap();
        std::fs::write(repo.0.join("new[1].txt"), "new content\n").unwrap();
        assert!(read_history(&repo.0).unwrap().has_changes);
        let files = read_commit_files(&repo.0, WORKTREE).unwrap();
        assert_eq!(files.len(), 2);
        assert!(
            files
                .iter()
                .any(|file| file.path == "new[1].txt" && file.status == "A")
        );
        let snapshot = read_history(&repo.0).unwrap().worktree_files;
        assert_eq!(snapshot.len(), files.len());
        let partially_staged = snapshot.iter().find(|file| file.path == "file.txt").unwrap();
        assert!(partially_staged.staged);
        assert!(partially_staged.partially_staged);
        let patch = read_file_diff(&repo.0, WORKTREE, "file.txt").unwrap().patch;
        assert!(patch.contains("-base"));
        assert!(patch.contains("+working"));
        assert!(!patch.contains("+staged"));
        assert!(
            read_file_diff(&repo.0, WORKTREE, "new[1].txt")
                .unwrap()
                .patch
                .contains("+new content")
        );
        commit_all(&repo, "Save changes before rename");
        git(&repo.0, &["mv", "file.txt", "renamed.txt"]).unwrap();
        assert!(
            read_worktree_files(&repo.0)
                .unwrap()
                .iter()
                .any(|file| file.path == "renamed.txt"
                    && file.old_path.as_deref() == Some("file.txt"))
        );
    }
    #[test]
    fn uncommitted_changes_work_before_first_commit() {
        let repo = TempRepo::new();
        repo.init();
        std::fs::write(repo.0.join("first.txt"), "first\n").unwrap();
        git(&repo.0, &["add", "first.txt"]).unwrap();
        assert!(read_history(&repo.0).unwrap().has_changes);
        assert!(
            read_file_diff(&repo.0, WORKTREE, "first.txt")
                .unwrap()
                .patch
                .contains("+first")
        );
    }
    #[test]
    fn branch_comparisons_use_upstream_or_head() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "Base");
        let main = read_history(&repo.0).unwrap().current_branch;
        let base = read_history(&repo.0).unwrap().tip;
        git(
            &repo.0,
            &["remote", "add", "origin", "/unused-local-remote"],
        )
        .unwrap();
        git(&repo.0, &["update-ref", "refs/remotes/origin/main", &base]).unwrap();
        git(&repo.0, &["branch", "--set-upstream-to=origin/main", &main]).unwrap();
        commit_file(&repo, "local", "Local");
        let comparisons = read_history(&repo.0).unwrap().branch_comparisons;
        assert_eq!(comparisons[&main].base, "origin/main");
        assert_eq!(
            (comparisons[&main].ahead, comparisons[&main].behind),
            (1, 0)
        );
        git(&repo.0, &["switch", "-c", "other", &base]).unwrap();
        commit_file(&repo, "remote", "Remote");
        git(&repo.0, &["update-ref", "refs/remotes/origin/main", "HEAD"]).unwrap();
        git(&repo.0, &["switch", &main]).unwrap();
        let comparisons = read_history(&repo.0).unwrap().branch_comparisons;
        assert_eq!(
            (comparisons[&main].ahead, comparisons[&main].behind),
            (1, 1)
        );
        assert_eq!(comparisons["other"].base, "HEAD");
        assert_eq!(
            (comparisons["other"].ahead, comparisons["other"].behind),
            (1, 1)
        );
    }
    fn configure_committer(repo: &TempRepo) {
        git(&repo.0, &["config", "user.name", "Test"]).unwrap();
        git(&repo.0, &["config", "user.email", "test@example.com"]).unwrap();
        git(&repo.0, &["config", "commit.gpgsign", "false"]).unwrap();
    }
    #[test]
    fn staging_and_commit_include_only_selected_files() {
        let repo = TempRepo::new();
        repo.init();
        configure_committer(&repo);
        commit_file(&repo, "base", "Base");
        std::fs::write(repo.0.join("file.txt"), "updated").unwrap();
        std::fs::write(repo.0.join("new[1].txt"), "new").unwrap();
        assert!(commit_staged(&repo.0, "Nothing").is_err());
        let details = set_file_staged(&repo.0, "file.txt", true).unwrap();
        assert!(
            details
                .files
                .iter()
                .find(|file| file.path == "file.txt")
                .unwrap()
                .staged
        );
        assert!(
            !details
                .files
                .iter()
                .find(|file| file.path == "new[1].txt")
                .unwrap()
                .staged
        );
        assert!(commit_staged(&repo.0, " ").is_err());
        let history = commit_staged(&repo.0, "Selected changes").unwrap();
        assert!(history.has_changes);
        assert_eq!(history.commits[0].subject, "Selected changes");
        assert_eq!(read_commit_files(&repo.0, &history.tip).unwrap().len(), 1);
        assert_eq!(read_worktree_files(&repo.0).unwrap()[0].path, "new[1].txt");
        set_file_staged(&repo.0, "new[1].txt", true).unwrap();
        set_file_staged(&repo.0, "new[1].txt", false).unwrap();
        assert_eq!(
            std::fs::read_to_string(repo.0.join("new[1].txt")).unwrap(),
            "new"
        );
        assert!(!read_worktree_files(&repo.0).unwrap()[0].staged);
    }
    #[test]
    fn staging_unstaging_and_committing_work_before_first_commit() {
        let repo = TempRepo::new();
        repo.init();
        configure_committer(&repo);
        std::fs::write(repo.0.join("first.txt"), "first").unwrap();
        set_file_staged(&repo.0, "first.txt", true).unwrap();
        set_file_staged(&repo.0, "first.txt", false).unwrap();
        assert!(repo.0.join("first.txt").exists());
        assert!(!read_worktree_files(&repo.0).unwrap()[0].staged);
        set_file_staged(&repo.0, "first.txt", true).unwrap();
        let history = commit_staged(&repo.0, "Initial").unwrap();
        assert!(!history.has_changes);
        assert_eq!(history.commits.len(), 1);
    }
    #[test]
    fn staging_handles_deletions_and_unstaging_renames_without_changing_files() {
        let repo = TempRepo::new();
        repo.init();
        configure_committer(&repo);
        commit_file(&repo, "base", "Base");
        git(&repo.0, &["mv", "file.txt", "new.txt"]).unwrap();
        set_file_staged(&repo.0, "new.txt", true).unwrap();
        set_file_staged(&repo.0, "new.txt", false).unwrap();
        assert!(repo.0.join("new.txt").exists());
        assert!(!repo.0.join("file.txt").exists());
        set_file_staged(&repo.0, "file.txt", true).unwrap();
        commit_staged(&repo.0, "Delete original").unwrap();
        assert!(repo.0.join("new.txt").exists());
    }
    #[test]
    fn scoped_diffs_separate_index_and_worktree_for_partial_staging() {
        let repo = commit_operation_repo();
        std::fs::write(repo.0.join("file.txt"), "index version").unwrap();
        set_file_staged(&repo.0, "file.txt", true).unwrap();
        std::fs::write(repo.0.join("file.txt"), "working version").unwrap();
        let staged = read_worktree_diff_scoped(&repo.0, "file.txt", Some(WorktreeDiffScope::Staged)).unwrap();
        assert!(staged.patch.contains("-base"));
        assert!(staged.patch.contains("+index version"));
        assert!(!staged.patch.contains("+working version"));
        let unstaged = read_worktree_diff_scoped(&repo.0, "file.txt", Some(WorktreeDiffScope::Unstaged)).unwrap();
        assert!(unstaged.patch.contains("-index version"));
        assert!(unstaged.patch.contains("+working version"));
        std::fs::write(repo.0.join("new[1].txt"), "untracked").unwrap();
        assert!(read_worktree_diff_scoped(&repo.0, "new[1].txt", Some(WorktreeDiffScope::Unstaged)).unwrap().patch.contains("+untracked"));
        assert!(read_worktree_diff_scoped(&repo.0, "new[1].txt", Some(WorktreeDiffScope::Staged)).is_err());
    }

    #[test]
    fn scoped_staged_diff_works_before_first_commit() {
        let repo = TempRepo::new();
        repo.init();
        std::fs::write(repo.0.join("first.txt"), "initial").unwrap();
        set_file_staged(&repo.0, "first.txt", true).unwrap();
        assert!(read_worktree_diff_scoped(&repo.0, "first.txt", Some(WorktreeDiffScope::Staged)).unwrap().patch.contains("+initial"));
    }

    #[test]
    fn partial_staging_commits_index_snapshot_and_preserves_later_edits() {
        let repo = TempRepo::new();
        repo.init();
        configure_committer(&repo);
        commit_file(&repo, "base", "Base");
        std::fs::write(repo.0.join("file.txt"), "staged version").unwrap();
        set_file_staged(&repo.0, "file.txt", true).unwrap();
        std::fs::write(repo.0.join("file.txt"), "later edit").unwrap();
        let file = read_worktree_files(&repo.0).unwrap().remove(0);
        assert!(file.staged && file.partially_staged);
        let history = commit_staged(&repo.0, "Index only").unwrap();
        assert!(history.has_changes);
        assert_eq!(
            git(&repo.0, &["show", "HEAD:file.txt"]).unwrap(),
            "staged version"
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "later edit"
        );
        assert!(!read_worktree_files(&repo.0).unwrap()[0].staged);
    }
    #[test]
    fn initializes_selected_folder_without_changing_its_files() {
        let repo = TempRepo::new();
        std::fs::write(repo.0.join("existing.txt"), "keep me").unwrap();
        assert!(can_initialize_repository(&repo.0).unwrap());
        initialize_repository(&repo.0).unwrap();
        assert!(repo.0.join(".git").is_dir());
        assert_eq!(
            std::fs::read_to_string(repo.0.join("existing.txt")).unwrap(),
            "keep me"
        );
        assert!(read_history(&repo.0).unwrap().commits.is_empty());
        assert!(!can_initialize_repository(&repo.0).unwrap());
        assert!(initialize_repository(&repo.0).is_err());
    }
    #[test]
    fn does_not_offer_initialization_for_missing_paths_or_existing_git_metadata() {
        let repo = TempRepo::new();
        assert!(can_initialize_repository(&repo.0.join("missing")).is_err());
        std::fs::write(repo.0.join(".git"), "existing metadata").unwrap();
        assert!(!can_initialize_repository(&repo.0).unwrap());
        assert!(initialize_repository(&repo.0).is_err());
        assert_eq!(
            std::fs::read_to_string(repo.0.join(".git")).unwrap(),
            "existing metadata"
        );
    }
    #[test]
    fn commit_rows_include_branch_remote_and_annotated_tag_labels() {
        let repo = TempRepo::new();
        repo.init();
        configure_committer(&repo);
        commit_file(&repo, "base", "Base");
        let initial = read_history(&repo.0).unwrap();
        git(&repo.0, &["tag", "plain"]).unwrap();
        git(&repo.0, &["tag", "-a", "annotated", "-m", "Release"]).unwrap();
        git(&repo.0, &["update-ref", "refs/remotes/origin/main", "HEAD"]).unwrap();
        git(
            &repo.0,
            &[
                "symbolic-ref",
                "refs/remotes/origin/HEAD",
                "refs/remotes/origin/main",
            ],
        )
        .unwrap();
        let row = read_history(&repo.0).unwrap().commits.remove(0);
        for (name, kind) in [
            (initial.current_branch.as_str(), "branch"),
            ("plain", "tag"),
            ("annotated", "tag"),
            ("origin/main", "remote"),
        ] {
            assert!(
                row.refs
                    .iter()
                    .any(|reference| reference.name == name && reference.kind == kind)
            );
        }
        assert!(
            !row.refs
                .iter()
                .any(|reference| reference.name == "origin/HEAD")
        );
        commit_file(&repo, "next", "Next");
        let history = read_history(&repo.0).unwrap();
        assert!(
            !history.commits[0]
                .refs
                .iter()
                .any(|reference| reference.kind == "tag")
        );
        assert!(
            history.commits[1]
                .refs
                .iter()
                .any(|reference| reference.name == "annotated")
        );
    }
    #[test]
    fn checkout_and_tag_use_selected_commit_without_moving_branch() {
        let repo = TempRepo::new();
        repo.init();
        configure_committer(&repo);
        commit_file(&repo, "base", "Base");
        let base = read_history(&repo.0).unwrap().tip;
        commit_file(&repo, "next", "Next");
        let before = read_history(&repo.0).unwrap();
        create_tag_at_commit(&repo.0, "old-release", &base).unwrap();
        assert_eq!(
            git(&repo.0, &["rev-parse", "old-release"]).unwrap().trim(),
            base
        );
        let checked = checkout_commit(&repo.0, &base).unwrap();
        assert!(checked.current_branch.is_empty());
        assert_eq!(checked.tip, base);
        assert_eq!(
            git(&repo.0, &["rev-parse", &before.current_branch])
                .unwrap()
                .trim(),
            before.tip
        );
        assert!(reset_branch_to_commit(&repo.0, &base, "mixed", false).is_err());
        assert!(checkout_commit(&repo.0, "WORKTREE").is_err());
    }
    #[test]
    fn reset_rejects_changed_head_or_branch_before_touching_files() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "Base");
        let first = read_history(&repo.0).unwrap();
        commit_file(&repo, "next", "Next");
        let current = read_history(&repo.0).unwrap();
        std::fs::write(repo.0.join("file.txt"), "keep these edits").unwrap();
        assert!(reset_branch_to_commit_checked(&repo.0, &first.tip, "hard", true, &first.tip, &current.current_branch).is_err());
        assert!(reset_branch_to_commit_checked(&repo.0, &first.tip, "hard", true, &current.tip, "another-branch").is_err());
        assert_eq!(read_history(&repo.0).unwrap().tip, current.tip);
        assert_eq!(std::fs::read_to_string(repo.0.join("file.txt")).unwrap(), "keep these edits");
    }

    #[test]
    fn reset_modes_preserve_or_discard_changes_as_requested() {
        for mode in ["soft", "mixed", "hard"] {
            let repo = TempRepo::new();
            repo.init();
            configure_committer(&repo);
            commit_file(&repo, "base", "Base");
            let base = read_history(&repo.0).unwrap().tip;
            commit_file(&repo, "next", "Next");
            std::fs::write(repo.0.join("file.txt"), "local edits").unwrap();
            if mode == "hard" {
                assert!(reset_branch_to_commit(&repo.0, &base, mode, false).is_err());
            }
            let result = reset_branch_to_commit(&repo.0, &base, mode, mode == "hard").unwrap();
            assert_eq!(result.tip, base);
            assert_eq!(
                std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
                if mode == "hard" {
                    "base"
                } else {
                    "local edits"
                }
            );
            let staged = git(&repo.0, &["diff", "--cached", "--name-only"]).unwrap();
            assert_eq!(!staged.is_empty(), mode == "soft");
        }
    }
    #[test]
    fn terminal_log_preserves_last_operation_and_reports_failures() {
        let repo = TempRepo::new();
        repo.init();
        let initial = terminal_log::latest(&repo.0).unwrap().unwrap();
        assert_eq!(initial.status, "success");
        assert_eq!(initial.command, "git init");
        read_history(&repo.0).unwrap();
        assert_eq!(
            terminal_log::latest(&repo.0).unwrap().unwrap().id,
            initial.id
        );
        assert!(git(&repo.0, &["switch", "missing-branch"]).is_err());
        let failed = terminal_log::latest(&repo.0).unwrap().unwrap();
        assert_eq!(failed.status, "error");
        assert!(!failed.output.is_empty());
        read_history(&repo.0).unwrap();
        assert_eq!(
            terminal_log::latest(&repo.0).unwrap().unwrap().id,
            failed.id
        );
    }
}
