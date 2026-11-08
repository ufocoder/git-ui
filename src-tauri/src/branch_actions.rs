use crate::{
    git, locale, project_path, read_history, read_remotes, read_worktree_files, ProjectHistory,
    Projects,
};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{State, WebviewWindow};

#[derive(Clone, Serialize, Deserialize)]
pub struct RemoteTarget {
    pub remote: String,
    pub reference: String,
    pub tip: Option<String>,
    pub error: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Preview {
    pub name: String,
    pub tip: String,
    pub head: String,
    pub branch: String,
    pub remotes: Vec<RemoteTarget>,
}
fn branch_ref(path: &Path, name: &str) -> Result<String, String> {
    let reference = format!("refs/heads/{name}");
    if name.is_empty() || name.starts_with('-') {
        return Err(locale::text("ref-action.invalid-name").into());
    }
    git(path, &["check-ref-format", &reference])
        .map_err(|_| locale::text("ref-action.invalid-name").to_owned())?;
    Ok(reference)
}
fn remote_reference(path: &Path, name: &str, remote: &str) -> Result<String, String> {
    let reference = branch_ref(path, name)?;
    let upstream = git(
        path,
        &[
            "for-each-ref",
            "--format=%(upstream:remotename)%00%(upstream:remoteref)",
            &reference,
        ],
    )?;
    if let Some((owner, target)) = upstream.trim_end().split_once('\0') {
        if owner == remote && target.starts_with("refs/heads/") {
            return Ok(target.into());
        }
    }
    Ok(reference)
}
fn remote_tip(path: &Path, remote: &str, reference: &str) -> Result<Option<String>, String> {
    let output = git(path, &["ls-remote", "--refs", "--", remote, reference])?;
    Ok(output
        .lines()
        .filter_map(|line| line.split_once('\t'))
        .find(|(_, name)| *name == reference)
        .map(|(tip, _)| tip.into()))
}
fn preview(path: &Path, name: &str, check_remotes: bool) -> Result<Preview, String> {
    let reference = branch_ref(path, name)?;
    let mut result = Preview {
        name: name.into(),
        tip: git(path, &["rev-parse", "--verify", &reference])?
            .trim()
            .into(),
        head: git(path, &["rev-parse", "--verify", "HEAD"])?.trim().into(),
        branch: git(path, &["branch", "--show-current"])?.trim().into(),
        remotes: vec![],
    };
    if check_remotes {
        for entry in read_remotes(path)? {
            let reference = remote_reference(path, name, &entry.name)?;
            let (tip, error) = match remote_tip(path, &entry.name, &reference) {
                Ok(tip) => (tip, None),
                Err(error) => (None, Some(error)),
            };
            result.remotes.push(RemoteTarget {
                remote: entry.name,
                reference,
                tip,
                error,
            });
        }
    }
    Ok(result)
}
fn execute(
    path: &Path,
    action: &str,
    expected: &Preview,
    remote: Option<&RemoteTarget>,
    confirmed: bool,
) -> Result<ProjectHistory, String> {
    if !confirmed {
        return Err(locale::text("operation.confirm").into());
    }
    if !["delete", "rebase"].contains(&action) {
        return Err(locale::text("ref-action.invalid-name").into());
    }
    crate::stash::ensure_no_operation(path)?;
    let current = preview(path, &expected.name, false)?;
    if current.tip != expected.tip
        || current.head != expected.head
        || current.branch != expected.branch
    {
        return Err(locale::text("safety.stale-head").into());
    }
    if action == "rebase" {
        crate::development_guard::ensure_safe(path)?;
        if current.branch.is_empty() || current.branch == current.name {
            return Err(locale::text("branch-action.invalid-rebase").into());
        }
        if !read_worktree_files(path)?.is_empty() {
            return Err(locale::text("operation.dirty").into());
        }
        // Use the confirmed immutable target, and do not honor an implicit autostash.
        git(
            path,
            &[
                "-c",
                "rebase.autoStash=false",
                "-c",
                "rebase.updateRefs=false",
                "rebase",
                "--no-autostash",
                &current.tip,
            ],
        )?;
    } else {
        let reference = branch_ref(path, &current.name)?;
        let worktrees = git(path, &["worktree", "list", "--porcelain"])?;
        if current.branch == current.name
            || worktrees
                .lines()
                .any(|line| line == format!("branch {reference}"))
        {
            return Err(locale::text("branch-action.checked-out").into());
        }
        // Validate before touching the remote. Local deletion is never forced.
        git(path, &["merge-base", "--is-ancestor", &current.tip, "HEAD"])
            .map_err(|_| locale::text("branch-action.unmerged").to_owned())?;
        if let Some(remote) = remote {
            if !read_remotes(path)?
                .iter()
                .any(|entry| entry.name == remote.remote)
                || remote.reference != remote_reference(path, &current.name, &remote.remote)?
            {
                return Err(locale::text("upstream.remote-missing").into());
            }
            let tip = remote.tip.as_deref().ok_or(locale::text("branch-action.remote-missing"))?;
            if ![40, 64].contains(&tip.len()) || !tip.bytes().all(|c| c.is_ascii_hexdigit()) {
                return Err(locale::text("error.invalid-history").into());
            }
            if let Some(actual) = remote_tip(path, &remote.remote, &remote.reference)? {
                if actual != tip {
                    return Err(locale::text("safety.stale-head").into());
                }
                let mirror = format!("remote.{}.mirror=false", remote.remote);
                let lease = format!("--force-with-lease={}:{}", remote.reference, tip);
                let deletion = format!(":{}", remote.reference);
                git(
                    path,
                    &[
                        "-c",
                        &mirror,
                        "push",
                        "--no-mirror",
                        "--no-prune",
                        "--no-follow-tags",
                        &lease,
                        "--",
                        &remote.remote,
                        &deletion,
                    ],
                )?;
            }
        }
        // Refuse if another process moved or checked out the branch meanwhile.
        if preview(path, &current.name, false)?.tip != expected.tip {
            return Err(locale::text("safety.stale-head").into());
        }
        git(path, &["branch", "-d", "--", &current.name])?;
    }
    read_history(path)
}
#[tauri::command]
pub async fn preview_branch_action(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    name: String,
    check_remotes: bool,
) -> Result<Preview, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || preview(Path::new(&path), &name, check_remotes))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn execute_branch_action(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    action: String,
    preview: Preview,
    remote: Option<RemoteTarget>,
    confirmed: bool,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        execute(
            Path::new(&path),
            &action,
            &preview,
            remote.as_ref(),
            confirmed,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{commit_file, TempRepo};
    fn repository() -> TempRepo {
        let repo = TempRepo::new();
        repo.init();
        git(&repo.0, &["config", "user.name", "Test"]).unwrap();
        git(&repo.0, &["config", "user.email", "test@example.com"]).unwrap();
        git(&repo.0, &["config", "commit.gpgsign", "false"]).unwrap();
        commit_file(&repo, "base\n", "base");
        repo
    }
    #[test]
    fn deletion_is_optional_remote_and_protects_current_and_unmerged() {
        let repo = repository();
        let remote = TempRepo::new();
        git(&remote.0, &["init", "--bare"]).unwrap();
        git(
            &repo.0,
            &["remote", "add", "origin", remote.0.to_str().unwrap()],
        )
        .unwrap();
        git(&repo.0, &["branch", "topic"]).unwrap();
        git(&repo.0, &["push", "origin", "topic:published"]).unwrap();
        git(&repo.0, &["config", "branch.topic.remote", "origin"]).unwrap();
        git(
            &repo.0,
            &["config", "branch.topic.merge", "refs/heads/published"],
        )
        .unwrap();
        let value = preview(&repo.0, "topic", true).unwrap();
        assert_eq!(value.remotes[0].reference, "refs/heads/published");
        execute(&repo.0, "delete", &value, None, true).unwrap();
        assert!(remote_tip(&repo.0, "origin", "refs/heads/published")
            .unwrap()
            .is_some());
        git(&repo.0, &["branch", "topic"]).unwrap();
        git(&repo.0, &["config", "branch.topic.remote", "origin"]).unwrap();
        git(
            &repo.0,
            &["config", "branch.topic.merge", "refs/heads/published"],
        )
        .unwrap();
        let value = preview(&repo.0, "topic", true).unwrap();
        execute(&repo.0, "delete", &value, Some(&value.remotes[0]), true).unwrap();
        assert!(remote_tip(&repo.0, "origin", "refs/heads/published")
            .unwrap()
            .is_none());
        let branch = git(&repo.0, &["branch", "--show-current"]).unwrap();
        let value = preview(&repo.0, branch.trim(), false).unwrap();
        assert!(execute(&repo.0, "delete", &value, None, true).is_err());
        git(&repo.0, &["checkout", "-b", "unmerged"]).unwrap();
        commit_file(&repo, "other\n", "other");
        git(&repo.0, &["checkout", branch.trim()]).unwrap();
        let value = preview(&repo.0, "unmerged", false).unwrap();
        assert!(execute(&repo.0, "delete", &value, None, true).is_err());
    }
    #[test]
    fn changed_remote_is_not_deleted() {
        let repo = repository();
        let remote = TempRepo::new();
        git(&remote.0, &["init", "--bare"]).unwrap();
        git(
            &repo.0,
            &["remote", "add", "origin", remote.0.to_str().unwrap()],
        )
        .unwrap();
        git(&repo.0, &["branch", "topic"]).unwrap();
        git(&repo.0, &["push", "origin", "topic"]).unwrap();
        let value = preview(&repo.0, "topic", true).unwrap();
        commit_file(&repo, "new\n", "new");
        git(&repo.0, &["push", "origin", "HEAD:topic"]).unwrap();
        let mut fresh = preview(&repo.0, "topic", false).unwrap();
        fresh.remotes = value.remotes;
        assert!(execute(&repo.0, "delete", &fresh, Some(&fresh.remotes[0]), true).is_err());
        assert!(remote_tip(&repo.0, "origin", "refs/heads/topic")
            .unwrap()
            .is_some());
        assert!(preview(&repo.0, "topic", false).is_ok());
    }
    #[test]
    fn clean_rebase_moves_current_branch_only_and_rejects_dirty_worktree() {
        let repo = repository();
        let branch = git(&repo.0, &["branch", "--show-current"]).unwrap();
        git(&repo.0, &["checkout", "-b", "target"]).unwrap();
        commit_file(&repo, "target\n", "target");
        let target = git(&repo.0, &["rev-parse", "HEAD"]).unwrap();
        git(&repo.0, &["checkout", branch.trim()]).unwrap();
        std::fs::write(repo.0.join("other.txt"), "local\n").unwrap();
        let value = preview(&repo.0, "target", false).unwrap();
        assert!(execute(&repo.0, "rebase", &value, None, true).is_err());
        git(&repo.0, &["add", "other.txt"]).unwrap();
        git(&repo.0, &["commit", "-m", "local"]).unwrap();
        let value = preview(&repo.0, "target", false).unwrap();
        assert!(execute(&repo.0, "rebase", &value, None, false).is_err());
        execute(&repo.0, "rebase", &value, None, true).unwrap();
        assert_eq!(git(&repo.0, &["rev-parse", "HEAD^"]).unwrap(), target);
        assert_eq!(git(&repo.0, &["rev-parse", "target"]).unwrap(), target);
        assert_eq!(git(&repo.0, &["branch", "--show-current"]).unwrap(), branch);
    }
    #[test]
    fn rebase_conflict_is_detected_and_can_abort_or_continue() {
        for resolve in [false, true] {
            let repo = repository();
            let branch = git(&repo.0, &["branch", "--show-current"]).unwrap();
            git(&repo.0, &["checkout", "-b", "target"]).unwrap();
            commit_file(&repo, "target\n", "target");
            git(&repo.0, &["checkout", branch.trim()]).unwrap();
            commit_file(&repo, "local\n", "local");
            let original = git(&repo.0, &["rev-parse", "HEAD"]).unwrap();
            let value = preview(&repo.0, "target", false).unwrap();
            assert!(execute(&repo.0, "rebase", &value, None, true).is_err());
            let operation = crate::commit_ops::read(&repo.0).unwrap().unwrap();
            assert_eq!(operation.kind, "rebase");
            assert_eq!(operation.conflicts, 1);
            let action = if resolve {
                std::fs::write(repo.0.join("file.txt"), "resolved\n").unwrap();
                git(&repo.0, &["add", "file.txt"]).unwrap();
                crate::commit_ops::Action::Continue
            } else {
                crate::commit_ops::Action::Abort { confirmed: true }
            };
            let head = git(&repo.0, &["rev-parse", "HEAD"]).unwrap();
            crate::commit_ops::run(&repo.0, head.trim(), "", action).unwrap();
            assert!(crate::commit_ops::read(&repo.0).unwrap().is_none());
            assert_eq!(git(&repo.0, &["branch", "--show-current"]).unwrap(), branch);
            if !resolve {
                assert_eq!(git(&repo.0, &["rev-parse", "HEAD"]).unwrap(), original);
            }
        }
    }
}
