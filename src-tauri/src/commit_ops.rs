use crate::{
    commit_diff_args, git, locale, project_path, read_history, read_worktree_files, ProjectHistory,
    Projects,
};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{State, WebviewWindow};

#[derive(Clone, Debug, Serialize)]
pub struct Operation {
    pub kind: String,
    pub commit: String,
    pub conflicts: usize,
    pub staged: bool,
}
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Action {
    CherryPick {
        commit: String,
        mainline: Option<usize>,
    },
    Revert {
        commit: String,
        mainline: Option<usize>,
    },
    Amend {
        commit: String,
        message: String,
        confirmed: bool,
    },
    Continue,
    Abort {
        confirmed: bool,
    },
    Skip {
        confirmed: bool,
    },
}

pub fn read(path: &Path) -> Result<Option<Operation>, String> {
    for folder in ["rebase-merge", "rebase-apply"] {
        let location = git(path, &["rev-parse", "--git-path", folder])?;
        let directory = path.join(location.trim());
        if directory.is_dir() {
            let commit = ["stopped-sha", "original-commit", "orig-head"]
                .iter()
                .find_map(|file| std::fs::read_to_string(directory.join(file)).ok())
                .unwrap_or_default();
            return Ok(Some(Operation {
                kind: "rebase".into(),
                commit: commit.trim().into(),
                conflicts: read_worktree_files(path)?
                    .iter()
                    .filter(|file| file.status == "U")
                    .count(),
                staged: !git(path, &["diff", "--cached", "--name-only", "-z"])?.is_empty(),
            }));
        }
    }
    for (file, kind) in [
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
        ("MERGE_HEAD", "merge"),
    ] {
        let file = git(path, &["rev-parse", "--git-path", file])?;
        match std::fs::read_to_string(path.join(file.trim())) {
            Ok(commit) => {
                return Ok(Some(Operation {
                    kind: kind.into(),
                    commit: commit.trim().into(),
                    conflicts: read_worktree_files(path)?
                        .iter()
                        .filter(|file| file.status == "U")
                        .count(),
                    staged: !git(path, &["diff", "--cached", "--name-only", "-z"])?.is_empty(),
                }));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(None)
}
fn mainline_args(
    path: &Path,
    commit: &str,
    mainline: Option<usize>,
) -> Result<Vec<String>, String> {
    commit_diff_args(path, commit)?;
    let row = git(path, &["rev-list", "--parents", "-n", "1", commit, "--"])?;
    let parents = row.split_whitespace().count().saturating_sub(1);
    if parents > 1 {
        let selected = mainline
            .filter(|parent| *parent > 0 && *parent <= parents)
            .ok_or(locale::text("operation.invalid-parent"))?;
        Ok(vec!["--mainline".into(), selected.to_string()])
    } else if mainline.is_some() {
        Err(locale::text("operation.invalid-parent").into())
    } else {
        Ok(Vec::new())
    }
}

#[cfg(test)]
pub fn run(
    path: &Path,
    head: &str,
    branch: &str,
    action: Action,
) -> Result<ProjectHistory, String> {
    run_with_options(
        path,
        head,
        branch,
        action,
        &crate::commit_options::Options::default(),
    )
}

pub fn run_with_options(
    path: &Path,
    head: &str,
    branch: &str,
    action: Action,
    options: &crate::commit_options::Options,
) -> Result<ProjectHistory, String> {
    let current_branch = git(path, &["branch", "--show-current"])?.trim().to_string();
    let rebase_control = matches!(
        &action,
        Action::Continue | Action::Abort { .. } | Action::Skip { .. }
    ) && read(path)?.is_some_and(|operation| operation.kind == "rebase");
    if current_branch.is_empty() && !rebase_control {
        return Err(locale::text("error.local-branch-required").into());
    }
    let current_head = git(path, &["rev-parse", "--revs-only", "HEAD"])?
        .trim()
        .to_string();
    if current_head != head || current_branch != branch {
        return Err(locale::text("operation.stale-target").into());
    }
    match action {
        Action::CherryPick {
            ref commit,
            mainline,
        }
        | Action::Revert {
            ref commit,
            mainline,
        } => {
            crate::stash::ensure_no_operation(path)?;
            if !read_worktree_files(path)?.is_empty() {
                return Err(locale::text("operation.dirty").into());
            }
            let mut args = if matches!(action, Action::CherryPick { .. }) {
                vec!["cherry-pick".to_string(), "--allow-empty".into()]
            } else {
                vec!["revert".to_string(), "--no-edit".into()]
            };
            args.extend(mainline_args(path, commit, mainline)?);
            args.push(commit.clone());
            git(path, &args.iter().map(String::as_str).collect::<Vec<_>>())?;
        }
        Action::Amend {
            commit,
            message,
            confirmed,
        } => {
            crate::stash::ensure_no_operation(path)?;
            if commit != current_head {
                return Err(locale::text("operation.amend-head-only").into());
            }
            if !confirmed {
                return Err(locale::text("operation.confirm").into());
            }
            if message.trim().is_empty() {
                return Err(locale::text("error.commit-message-required").into());
            }
            if read_worktree_files(path)?
                .iter()
                .any(|file| file.status == "U")
            {
                return Err(locale::text("operation.resolve-first").into());
            }
            crate::commit_options::commit(path, message.trim(), true, options)?;
        }
        Action::Continue => {
            let operation = read(path)?.ok_or(locale::text("operation.none"))?;
            if operation.conflicts > 0 {
                return Err(locale::text("operation.resolve-first").into());
            }
            if operation.kind == "merge" {
                git(path, &["commit", "--no-edit"])?;
            } else {
                git(path, &[&operation.kind, "--continue"])?;
            }
        }
        Action::Abort { confirmed } | Action::Skip { confirmed } => {
            if !confirmed {
                return Err(locale::text("operation.confirm").into());
            }
            let operation = read(path)?.ok_or(locale::text("operation.none"))?;
            if operation.kind == "merge" && matches!(action, Action::Skip { .. }) {
                return Err(locale::text("conflict.cannot-skip-merge").into());
            }
            let flag = if matches!(action, Action::Abort { .. }) {
                "--abort"
            } else {
                "--skip"
            };
            git(path, &[&operation.kind, flag])?;
        }
    }
    read_history(path)
}

#[tauri::command]
pub async fn run_commit_operation(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    head: String,
    branch: String,
    action: Action,
    options: Option<crate::commit_options::Options>,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        run_with_options(
            Path::new(&path),
            &head,
            &branch,
            action,
            &options.unwrap_or_default(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
