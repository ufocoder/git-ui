use crate::{
    git, locale, project_path, read_history, read_worktree_files, ProjectHistory, Projects,
};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{State, WebviewWindow};

#[derive(Clone, Debug, Serialize)]
pub struct StashEntry {
    pub id: String,
    pub reference: String,
    pub message: String,
    pub date: String,
}
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StashAction {
    Save {
        message: String,
        include_untracked: bool,
    },
    Apply {
        id: String,
        restore_index: bool,
    },
    Drop {
        id: String,
        confirmed: bool,
    },
}

pub fn list(path: &Path) -> Result<Vec<StashEntry>, String> {
    let output = git(
        path,
        &["stash", "list", "--format=%gd%x00%H%x00%gs%x00%cI", "-z"],
    )?;
    Ok(output
        .split_terminator('\0')
        .collect::<Vec<_>>()
        .chunks_exact(4)
        .map(|fields| StashEntry {
            reference: fields[0].into(),
            id: fields[1].into(),
            message: fields[2].into(),
            date: fields[3].into(),
        })
        .collect())
}
fn selected(path: &Path, id: &str) -> Result<StashEntry, String> {
    if ![40, 64].contains(&id.len()) || !id.bytes().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(locale::text("stash11").into());
    }
    list(path)?
        .into_iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| locale::text("stash11").into())
}
pub(crate) fn ensure_no_operation(path: &Path) -> Result<(), String> {
    for name in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
    ] {
        let metadata = git(path, &["rev-parse", "--git-path", name])?;
        if path.join(metadata.trim()).exists() {
            return Err(locale::text("stash12").into());
        }
    }
    Ok(())
}

fn ensure_source_is_not_running(path: &Path) -> Result<(), String> {
    if crate::development_guard::is_running_source(path) {
        return Err(locale::text("stash26").into());
    }
    Ok(())
}

pub fn run(path: &Path, action: StashAction) -> Result<ProjectHistory, String> {
    match action {
        StashAction::Save {
            message,
            include_untracked,
        } => {
            ensure_source_is_not_running(path)?;
            ensure_no_operation(path)?;
            if git(path, &["rev-parse", "--revs-only", "HEAD"])?
                .trim()
                .is_empty()
            {
                return Err(locale::text("stash13").into());
            }
            let files = read_worktree_files(path)?;
            if files.is_empty() {
                return Err(locale::text("stash14").into());
            }
            if !include_untracked
                && git(
                    path,
                    &["status", "--porcelain=v1", "-z", "--untracked-files=no"],
                )?
                .is_empty()
            {
                return Err(locale::text("stash14").into());
            }
            let mut args = vec!["stash", "push"];
            if include_untracked {
                args.push("--include-untracked");
            }
            let message = message.trim();
            if !message.is_empty() {
                args.extend(["-m", message]);
            }
            git(path, &args)?;
        }
        StashAction::Apply { id, restore_index } => {
            ensure_source_is_not_running(path)?;
            ensure_no_operation(path)?;
            let entry = selected(path, &id)?;
            let mut args = vec!["stash", "apply"];
            if restore_index {
                args.push("--index");
            }
            args.push(&entry.id);
            // Applying never drops the saved object, including when Git reports conflicts.
            git(path, &args)?;
        }
        StashAction::Drop { id, confirmed } => {
            if !confirmed {
                return Err(locale::text("stash15").into());
            }
            let entry = selected(path, &id)?;
            if git(path, &["rev-parse", "--verify", &entry.reference])?.trim() != entry.id {
                return Err(locale::text("stash11").into());
            }
            git(path, &["stash", "drop", &entry.reference])?;
        }
    }
    read_history(path)
}

#[tauri::command]
pub async fn stash_project(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    action: StashAction,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || run(Path::new(&path), action))
        .await
        .map_err(|e| e.to_string())?
}

// Stash's third parent contains new files omitted by a first-parent diff.
fn untracked_parent(path: &Path, id: &str) -> Result<Option<String>, String> {
    let parents = git(path, &["rev-list", "--parents", "-n", "1", id, "--"])?;
    Ok(parents.split_whitespace().nth(3).map(str::to_owned))
}
pub(crate) fn details(path: &Path, id: &str) -> Result<crate::CommitDetails, String> {
    selected(path, id)?;
    let mut result = crate::read_commit_details(path, id)?;
    if let Some(parent) = untracked_parent(path, id)? {
        result
            .files
            .extend(crate::read_commit_files(path, &parent)?);
    }
    Ok(result)
}
#[tauri::command]
pub async fn get_stash_details(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    id: String,
) -> Result<crate::CommitDetails, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || details(Path::new(&path), &id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn get_stash_diff(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    id: String,
    file_path: String,
) -> Result<crate::FileDiff, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&path);
        selected(path, &id)?;
        let source = if crate::read_commit_files(path, &id)?
            .iter()
            .any(|file| file.path == file_path)
        {
            id.clone()
        } else {
            untracked_parent(path, &id)?.ok_or_else(|| locale::text("err20").to_string())?
        };
        let mut diff = crate::read_file_diff(path, &source, &file_path)?;
        diff.commit = id;
        Ok(diff)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[cfg(debug_assertions)]
    fn prevents_save_and_apply_before_touching_running_sources() {
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        for action in [
            StashAction::Save {
                message: String::new(),
                include_untracked: true,
            },
            StashAction::Apply {
                id: "invalid-id".into(),
                restore_index: true,
            },
        ] {
            assert_eq!(run(source, action).unwrap_err(), locale::text("stash26"));
        }
    }
    #[test]
    fn prevents_stashing_the_running_development_checkout() {
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        assert_eq!(
            ensure_source_is_not_running(source).is_err(),
            cfg!(debug_assertions)
        );
        assert!(ensure_source_is_not_running(Path::new(env!("CARGO_MANIFEST_DIR"))).is_ok());
    }
}
