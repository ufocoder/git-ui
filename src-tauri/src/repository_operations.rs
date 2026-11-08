use crate::{
    CommitDetails, ProjectHistory, Projects, WORKTREE, commit_diff_args, commit_options,
    development_guard, fetch_status, git, locale, project_path, read_commit_details, read_history,
    read_worktree_files, tracking,
};
use std::path::Path;
use tauri::{State, WebviewWindow};

pub(super) fn switch_branch(path: &Path, branch: &str) -> Result<ProjectHistory, String> {
    development_guard::ensure_safe(path)?;
    let history = read_history(path)?;
    if !history.branches.iter().any(|name| name == branch) {
        return Err(locale::text("err25").into());
    }
    git(path, &["switch", "--no-guess", "--", branch])?;
    read_history(path)
}

#[tauri::command]
pub(super) async fn switch_project_branch(
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

pub(super) fn create_branch_at_commit(
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
pub(super) async fn create_project_branch_at_commit(
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

pub(super) fn create_branch(path: &Path, name: &str) -> Result<ProjectHistory, String> {
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
pub(super) async fn create_project_branch(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    name: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || create_branch(Path::new(&path), &name))
        .await
        .map_err(|e| e.to_string())?
}

pub(super) fn create_tag(path: &Path, name: &str) -> Result<ProjectHistory, String> {
    create_tag_at_commit(path, name, "HEAD")
}

pub(super) fn create_tag_at_commit(
    path: &Path,
    name: &str,
    commit: &str,
) -> Result<ProjectHistory, String> {
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

pub(super) fn checkout_commit(path: &Path, commit: &str) -> Result<ProjectHistory, String> {
    development_guard::ensure_safe(path)?;
    commit_diff_args(path, commit)?;
    git(path, &["switch", "--detach", commit])?;
    read_history(path)
}

pub(super) fn reset_branch_to_commit(
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
pub(super) async fn checkout_project_commit(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    commit: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || checkout_commit(Path::new(&path), &commit))
        .await
        .map_err(|e| e.to_string())?
}

pub(super) fn reset_branch_to_commit_checked(
    path: &Path,
    commit: &str,
    mode: &str,
    confirmed: bool,
    expected_head: &str,
    expected_branch: &str,
) -> Result<ProjectHistory, String> {
    if git(path, &["rev-parse", "HEAD"])?.trim() != expected_head
        || git(path, &["branch", "--show-current"])?.trim() != expected_branch
    {
        return Err(locale::text("safe05").into());
    }
    reset_branch_to_commit(path, commit, mode, confirmed)
}

#[tauri::command]
pub(super) async fn reset_project_commit(
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
            Path::new(&path),
            &commit,
            &mode,
            discard_confirmed,
            &expected_head,
            &expected_branch,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(super) async fn create_project_tag_at_commit(
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

pub(super) fn add_remote(path: &Path, name: &str, url: &str) -> Result<ProjectHistory, String> {
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
pub(super) async fn create_project_tag(
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
pub(super) async fn add_project_remote(
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

pub(super) fn set_file_staged(
    path: &Path,
    file_path: &str,
    staged: bool,
) -> Result<CommitDetails, String> {
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
pub(super) fn commit_staged(path: &Path, message: &str) -> Result<ProjectHistory, String> {
    commit_staged_with_options(path, message, &commit_options::Options::default())
}
pub(super) fn commit_staged_with_options(
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
pub(super) async fn set_project_file_staged(
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
pub(super) async fn commit_project_changes(
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

pub(super) fn sync_repository(
    path: &Path,
    action: &str,
    pull_mode: tracking::PullMode,
) -> Result<ProjectHistory, String> {
    let history = read_history(path)?;
    if action != "fetch" && history.current_branch.is_empty() {
        return Err(locale::text("err44").into());
    }
    if history.remotes.is_empty() && !(action == "pull" && history.sync.upstream.is_some()) {
        return Err(locale::text("err45").into());
    }
    match action {
        "fetch" => {
            git(path, &["fetch", "--all", "--prune"])?;
            fetch_status::record(path);
        }
        "pull" => {
            tracking::pull_current(path, pull_mode)?;
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
pub(super) async fn sync_project(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    action: String,
    pull_mode: Option<tracking::PullMode>,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        sync_repository(Path::new(&path), &action, pull_mode.unwrap_or_default())
    })
    .await
    .map_err(|e| e.to_string())?
}
