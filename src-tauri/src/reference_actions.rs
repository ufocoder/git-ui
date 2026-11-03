use crate::{git, locale, project_path, read_history, ProjectHistory, Projects};
use std::path::Path;
use tauri::{State, WebviewWindow};

fn change(
    path: &Path,
    kind: &str,
    name: &str,
    new_name: Option<&str>,
    confirmed: bool,
) -> Result<ProjectHistory, String> {
    let prefix = match kind {
        "branch" => "refs/heads",
        "tag" => "refs/tags",
        _ => return Err(locale::text("refAct07").into()),
    };
    let reference = format!("{prefix}/{name}");
    if name.is_empty() || name.starts_with('-') {
        return Err(locale::text("refAct07").into());
    }
    git(path, &["check-ref-format", &reference])
        .map_err(|_| locale::text("refAct07").to_owned())?;
    let object = git(path, &["rev-parse", "--verify", &reference])?;
    let object = object.trim();
    if let Some(new_name) = new_name {
        let target = format!("{prefix}/{new_name}");
        if new_name.is_empty() || new_name.starts_with('-') || new_name == name {
            return Err(locale::text("refAct07").into());
        }
        git(path, &["check-ref-format", &target])
            .map_err(|_| locale::text("refAct07").to_owned())?;
        if kind == "branch" {
            git(path, &["branch", "-m", "--", name, new_name])?;
        } else {
            // Preserve the annotated tag object and reject an existing destination.
            let zero = "0".repeat(object.len());
            git(path, &["update-ref", &target, object, &zero])?;
            if let Err(error) = git(path, &["update-ref", "-d", &reference, object]) {
                let _ = git(path, &["update-ref", "-d", &target, object]);
                return Err(error);
            }
        }
    } else {
        if !confirmed {
            return Err(locale::text("refAct08").into());
        }
        if kind != "branch" {
            return Err(locale::text("refAct07").into());
        }
        // Git refuses deleting current, checked-out-in-worktree and unmerged branches.
        git(path, &["branch", "-d", "--", name])?;
    }
    read_history(path)
}

#[tauri::command]
pub async fn change_project_reference(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    kind: String,
    name: String,
    new_name: Option<String>,
    confirmed: bool,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        change(
            Path::new(&path),
            &kind,
            &name,
            new_name.as_deref(),
            confirmed,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{commit_file, TempRepo};
    #[test]
    fn renames_current_branch_and_deletes_only_confirmed_inactive_branch() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "first", "initial");
        let current = git(&repo.0, &["branch", "--show-current"]).unwrap();
        change(&repo.0, "branch", current.trim(), Some("renamed"), false).unwrap();
        assert_eq!(
            git(&repo.0, &["branch", "--show-current"]).unwrap().trim(),
            "renamed"
        );
        git(&repo.0, &["branch", "other"]).unwrap();
        assert!(change(&repo.0, "branch", "other", None, false).is_err());
        change(&repo.0, "branch", "other", None, true).unwrap();
        assert!(change(&repo.0, "branch", "renamed", None, true).is_err());
        assert!(change(&repo.0, "branch", "renamed", Some("../bad"), false).is_err());
    }
    #[test]
    fn tag_rename_preserves_annotation_and_rejects_existing_destination() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "first", "initial");
        git(
            &repo.0,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.com",
                "-c",
                "tag.gpgsign=false",
                "tag",
                "-a",
                "old",
                "-m",
                "release",
            ],
        )
        .unwrap();
        let object = git(&repo.0, &["rev-parse", "refs/tags/old"]).unwrap();
        change(&repo.0, "tag", "old", Some("new"), false).unwrap();
        assert_eq!(
            object,
            git(&repo.0, &["rev-parse", "refs/tags/new"]).unwrap()
        );
        git(&repo.0, &["-c", "tag.gpgsign=false", "tag", "existing"]).unwrap();
        assert!(change(&repo.0, "tag", "new", Some("existing"), false).is_err());
        assert!(git(&repo.0, &["show-ref", "--verify", "refs/tags/new"]).is_ok());
    }
    #[test]
    fn refuses_deleting_unmerged_branch() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "first", "initial");
        let current = git(&repo.0, &["branch", "--show-current"]).unwrap();
        git(&repo.0, &["checkout", "-b", "unmerged"]).unwrap();
        commit_file(&repo, "second", "unmerged");
        git(&repo.0, &["checkout", current.trim()]).unwrap();
        assert!(change(&repo.0, "branch", "unmerged", None, true).is_err());
        assert!(git(&repo.0, &["show-ref", "--verify", "refs/heads/unmerged"]).is_ok());
    }
}
