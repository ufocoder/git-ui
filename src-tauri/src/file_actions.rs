use crate::{git, locale, project_path, read_history, ProjectHistory, Projects};
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use tauri::{State, WebviewWindow};

fn target(root: &Path, file: &str) -> Result<PathBuf, String> {
    let relative = Path::new(file);
    if file.is_empty()
        || file.contains('\0')
        || relative.components().any(|part| {
            !matches!(part, Component::Normal(_))
                || part
                    .as_os_str()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(".git")
        })
    {
        return Err(locale::text("file-action.invalid-path").into());
    }
    let target = root.join(relative);
    let mut parent = target.parent();
    while let Some(path) = parent {
        if path == root {
            return Ok(target);
        }
        if std::fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
            return Err(locale::text("file-action.invalid-path").into());
        }
        parent = path.parent();
    }
    Err(locale::text("file-action.invalid-path").into())
}

#[derive(Serialize)]
pub struct RestorePreview {
    commit: String,
    subject: String,
    head: String,
    branch: String,
}

fn preview(root: &Path, file: &str, commit: &str) -> Result<RestorePreview, String> {
    target(root, file)?;
    if !(4..=64).contains(&commit.len()) || !commit.bytes().all(|value| value.is_ascii_hexdigit()) {
        return Err(locale::text("error.invalid-history").into());
    }
    let commit = git(
        root,
        &["rev-parse", "--verify", &format!("{commit}^{{commit}}")],
    )?
    .trim()
    .to_owned();
    let head = git(root, &["rev-parse", "HEAD"])?.trim().to_owned();
    let branch = git(root, &["branch", "--show-current"])?.trim().to_owned();
    let subject = git(
        root,
        &[
            "show",
            "--no-patch",
            "--no-show-signature",
            "--format=%s",
            &commit,
            "--",
        ],
    )?
    .trim()
    .to_owned();
    Ok(RestorePreview {
        commit,
        subject,
        head,
        branch,
    })
}

fn restore(
    root: &Path,
    file: &str,
    commit: &str,
    head: &str,
    branch: &str,
    confirmed: bool,
) -> Result<ProjectHistory, String> {
    if !confirmed {
        return Err(locale::text("file-action.confirm-required").into());
    }
    let current = preview(root, file, commit)?;
    if current.head != head || current.branch != branch {
        return Err(locale::text("safety.stale-head").into());
    }
    let history = read_history(root)?;
    if history.operation.is_some() || !history.conflicts.is_empty() {
        return Err(locale::text("file-action.operation-in-progress").into());
    }
    git(
        root,
        &[
            "restore",
            &format!("--source={}", current.commit),
            "--staged",
            "--worktree",
            "--",
            &format!(":(literal){file}"),
        ],
    )?;
    read_history(root)
}

#[tauri::command]
pub fn file_actions_platform() -> &'static str {
    std::env::consts::OS
}

#[tauri::command]
pub async fn preview_restore_path(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    file: String,
    commit: String,
) -> Result<RestorePreview, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || preview(Path::new(&path), &file, &commit))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn restore_project_path(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    file: String,
    commit: String,
    head: String,
    branch: String,
    confirmed: bool,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        restore(Path::new(&path), &file, &commit, &head, &branch, confirmed)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn reveal_project_path(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    file: String,
) -> Result<(), String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(&path);
        let mut path = target(root, &file)?;
        while std::fs::symlink_metadata(&path).is_err() && path != root {
            path.pop();
        }
        tauri_plugin_opener::reveal_item_in_dir(path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{commit_file, TempRepo};
    #[test]
    fn restores_directory_and_literal_names_without_touching_siblings() {
        let repo = TempRepo::new();
        repo.init();
        std::fs::create_dir_all(repo.0.join("src/lib")).unwrap();
        std::fs::write(repo.0.join("src/a[1].txt"), "old").unwrap();
        std::fs::write(repo.0.join("src/lib/b.txt"), "old nested").unwrap();
        git(&repo.0, &["add", "src"]).unwrap();
        commit_file(&repo, "base", "Base");
        let old = read_history(&repo.0).unwrap();
        std::fs::write(repo.0.join("src/a[1].txt"), "changed").unwrap();
        std::fs::write(repo.0.join("src/lib/b.txt"), "changed nested").unwrap();
        std::fs::write(repo.0.join("src/a1.txt"), "keep literal sibling").unwrap();
        let snap = preview(&repo.0, "src/a[1].txt", &old.tip).unwrap();
        restore(
            &repo.0,
            "src/a[1].txt",
            &old.tip,
            &snap.head,
            &snap.branch,
            true,
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(repo.0.join("src/a1.txt")).unwrap(),
            "keep literal sibling"
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("src/lib/b.txt")).unwrap(),
            "changed nested"
        );
        restore(&repo.0, "src", &old.tip, &snap.head, &snap.branch, true).unwrap();
        assert_eq!(
            std::fs::read_to_string(repo.0.join("src/lib/b.txt")).unwrap(),
            "old nested"
        );
    }

    #[test]
    fn removes_a_tracked_path_missing_from_target_commit() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "Base");
        let old = read_history(&repo.0).unwrap();
        std::fs::write(repo.0.join("new.txt"), "new").unwrap();
        git(&repo.0, &["add", "new.txt"]).unwrap();
        commit_file(&repo, "next", "Next");
        let snap = preview(&repo.0, "new.txt", &old.tip).unwrap();
        restore(&repo.0, "new.txt", &old.tip, &snap.head, &snap.branch, true).unwrap();
        assert!(!repo.0.join("new.txt").exists());
        assert_eq!(read_history(&repo.0).unwrap().tip, snap.head);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_parent_paths() {
        let repo = TempRepo::new();
        repo.init();
        let outside = TempRepo::new();
        std::os::unix::fs::symlink(&outside.0, repo.0.join("link")).unwrap();
        assert!(target(&repo.0, "link/file.txt").is_err());
    }

    #[test]
    fn restores_only_selected_path_without_moving_head() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "old", "Base");
        let old = read_history(&repo.0).unwrap();
        commit_file(&repo, "new", "Next");
        std::fs::write(repo.0.join("other.txt"), "keep").unwrap();
        git(&repo.0, &["add", "other.txt"]).unwrap();
        let before = preview(&repo.0, "file.txt", &old.tip[..8]).unwrap();
        assert!(restore(
            &repo.0,
            "file.txt",
            &old.tip,
            &before.head,
            &before.branch,
            false
        )
        .is_err());
        assert!(restore(
            &repo.0,
            "file.txt",
            &old.tip,
            &old.tip,
            &before.branch,
            true
        )
        .is_err());
        let result = restore(
            &repo.0,
            "file.txt",
            &old.tip,
            &before.head,
            &before.branch,
            true,
        )
        .unwrap();
        assert_eq!(result.tip, before.head);
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "old"
        );
        assert_eq!(git(&repo.0, &["show", ":other.txt"]).unwrap(), "keep");
        assert!(target(&repo.0, "../outside").is_err());
        assert!(target(&repo.0, ".git/config").is_err());
    }
}
