use crate::{ProjectHistory, Projects, git, locale, project_path, read_history, read_remotes};
use std::path::Path;
use tauri::{State, WebviewWindow};

fn current_branch(path: &Path, expected: Option<&str>) -> Result<String, String> {
    let branch = git(path, &["branch", "--show-current"])?.trim().to_owned();
    if branch.is_empty() {
        return Err(locale::text("err44").into());
    }
    if expected.is_some_and(|expected| expected != branch) {
        return Err(locale::text("track12").into());
    }
    if git(path, &["rev-parse", "--revs-only", "HEAD"])?
        .trim()
        .is_empty()
    {
        return Err(locale::text("track13").into());
    }
    Ok(branch)
}
fn validate_remote(path: &Path, name: &str) -> Result<(), String> {
    if name.starts_with('-') || !read_remotes(path)?.iter().any(|remote| remote.name == name) {
        return Err(locale::text("track14").into());
    }
    Ok(())
}
fn target_ref(path: &Path, branch: &str) -> Result<String, String> {
    if branch.is_empty() || branch.trim() != branch || branch.starts_with('-') {
        return Err(locale::text("track15").into());
    }
    let reference = format!("refs/heads/{branch}");
    git(path, &["check-ref-format", &reference])
        .map_err(|_| locale::text("track15").to_string())?;
    Ok(reference)
}

pub fn publish(
    path: &Path,
    expected_branch: &str,
    remote: &str,
    remote_branch: &str,
) -> Result<ProjectHistory, String> {
    let branch = current_branch(path, Some(expected_branch))?;
    validate_remote(path, remote)?;
    let target = target_ref(path, remote_branch)?;
    // Explicit source and target prevent push.default=matching or remote.push
    // settings from publishing other local branches. A diverged target is rejected.
    let refspec = format!("refs/heads/{branch}:{target}");
    git(
        path,
        &[
            "push",
            "--no-force",
            "--set-upstream",
            "--",
            remote,
            &refspec,
        ],
    )?;
    read_history(path)
}

pub fn set_upstream(
    path: &Path,
    expected_branch: &str,
    remote: &str,
    remote_branch: &str,
) -> Result<ProjectHistory, String> {
    let branch = current_branch(path, Some(expected_branch))?;
    validate_remote(path, remote)?;
    target_ref(path, remote_branch)?;
    let known = read_remotes(path)?
        .into_iter()
        .find(|entry| entry.name == remote)
        .ok_or(locale::text("track14"))?;
    if !known.branches.iter().any(|branch| branch == remote_branch) {
        return Err(locale::text("track16").into());
    }
    let reference = format!("refs/remotes/{remote}/{remote_branch}");
    git(
        path,
        &[
            "branch",
            &format!("--set-upstream-to={reference}"),
            "--",
            &branch,
        ],
    )?;
    read_history(path)
}

fn destination(path: &Path, branch: &str) -> Result<(String, String), String> {
    let output = git(
        path,
        &[
            "for-each-ref",
            "--format=%(upstream:remotename)%00%(upstream:remoteref)",
            &format!("refs/heads/{branch}"),
        ],
    )?;
    let Some((remote, reference)) = output.trim_end().split_once('\0') else {
        return Err(locale::text("track17").into());
    };
    if remote.is_empty() || !reference.starts_with("refs/heads/") {
        return Err(locale::text("track17").into());
    }
    validate_remote(path, remote)?;
    Ok((remote.into(), reference.into()))
}

pub fn push_current(path: &Path) -> Result<(), String> {
    let branch = current_branch(path, None)?;
    let (remote, target) = destination(path, &branch)?;
    let refspec = format!("refs/heads/{branch}:{target}");
    git(path, &["push", "--no-force", "--", &remote, &refspec])?;
    Ok(())
}
pub fn pull_current(path: &Path) -> Result<(), String> {
    let branch = current_branch(path, None)?;
    let (remote, target) = destination(path, &branch)?;
    git(
        path,
        &["pull", "--ff-only", "--no-rebase", "--", &remote, &target],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn publish_project_branch(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    branch: String,
    remote: String,
    remote_branch: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        publish(Path::new(&path), &branch, &remote, &remote_branch)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn set_project_upstream(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    branch: String,
    remote: String,
    remote_branch: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        set_upstream(Path::new(&path), &branch, &remote, &remote_branch)
    })
    .await
    .map_err(|e| e.to_string())?
}
