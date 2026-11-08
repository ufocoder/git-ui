use crate::{git, locale, project_path, read_history, read_remotes, ProjectHistory, Projects};
use std::path::Path;
use tauri::{State, WebviewWindow};

fn push(path: &Path, remote: &str, tag: Option<&str>) -> Result<ProjectHistory, String> {
    if remote.starts_with('-') || !read_remotes(path)?.iter().any(|entry| entry.name == remote) {
        return Err(locale::text("upstream.remote-missing").into());
    }
    let references: Vec<String> = match tag {
        Some(name) => {
            let reference = format!("refs/tags/{name}");
            if name.is_empty() || name.starts_with('-') {
                return Err(locale::text("tag-push.invalid-tag").into());
            }
            git(path, &["check-ref-format", &reference])
                .map_err(|_| locale::text("tag-push.invalid-tag").to_owned())?;
            git(path, &["show-ref", "--verify", &reference])
                .map_err(|_| locale::text("tag-push.invalid-tag").to_owned())?;
            vec![reference]
        }
        None => git(path, &["for-each-ref", "--format=%(refname)", "refs/tags/"])?
            .lines()
            .map(str::to_owned)
            .collect(),
    };
    if references.is_empty() {
        return Err(locale::text("tag-push.invalid-tag").into());
    }
    let refspecs: Vec<String> = references
        .iter()
        .map(|reference| format!("{reference}:{reference}"))
        .collect();
    // Explicit refspecs and flags override remote.push, mirror, pruning and followTags.
    // This sends tags only and never force-replaces existing remote tags.
    let mirror = format!("remote.{remote}.mirror=false");
    let mut args = vec![
        "-c",
        &mirror,
        "push",
        "--no-force",
        "--no-mirror",
        "--no-prune",
        "--no-follow-tags",
        "--",
        remote,
    ];
    args.extend(refspecs.iter().map(String::as_str));
    git(path, &args)?;
    read_history(path)
}

#[tauri::command]
pub async fn push_project_tags(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    remote: String,
    tag: Option<String>,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || push(Path::new(&path), &remote, tag.as_deref()))
        .await
        .map_err(|error| error.to_string())?
}

fn remote_tag_exists(path: &Path, remote: &str, tag: &str) -> Result<bool, String> {
    if remote.starts_with('-') || !read_remotes(path)?.iter().any(|entry| entry.name == remote) {
        return Err(locale::text("upstream.remote-missing").into());
    }
    let reference = format!("refs/tags/{tag}");
    if tag.is_empty() || tag.starts_with('-') {
        return Err(locale::text("tag-push.invalid-tag").into());
    }
    git(path, &["check-ref-format", &reference])
        .map_err(|_| locale::text("tag-push.invalid-tag").to_owned())?;
    let refs = git(path, &["ls-remote", "--refs", "--", remote, &reference])?;
    Ok(refs.lines().any(|line| {
        line.split_once('\t')
            .is_some_and(|(_, name)| name == reference)
    }))
}

#[tauri::command]
pub async fn remote_project_tag_exists(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    remote: String,
    tag: String,
) -> Result<bool, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || remote_tag_exists(Path::new(&path), &remote, &tag))
        .await
        .map_err(|error| error.to_string())?
}

fn delete(
    path: &Path,
    tag: &str,
    remote: Option<&str>,
    confirmed: bool,
) -> Result<ProjectHistory, String> {
    if !confirmed {
        return Err(locale::text("tag-delete.confirm").into());
    }
    let reference = format!("refs/tags/{tag}");
    if tag.is_empty() || tag.starts_with('-') {
        return Err(locale::text("tag-push.invalid-tag").into());
    }
    git(path, &["check-ref-format", &reference])
        .map_err(|_| locale::text("tag-push.invalid-tag").to_owned())?;
    let object = git(path, &["rev-parse", "--verify", &reference])
        .map_err(|_| locale::text("tag-push.invalid-tag").to_owned())?;
    let object = object.trim();
    if let Some(remote) = remote {
        if remote.starts_with('-') || !read_remotes(path)?.iter().any(|entry| entry.name == remote)
        {
            return Err(locale::text("upstream.remote-missing").into());
        }
        if remote_tag_exists(path, remote, tag)? {
            let mirror = format!("remote.{remote}.mirror=false");
            let lease = format!("--force-with-lease={reference}:{object}");
            let deletion = format!(":{reference}");
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
                    remote,
                    &deletion,
                ],
            )?;
        }
    }
    // Compare-and-delete refuses a tag moved while the remote operation was running.
    git(path, &["update-ref", "-d", &reference, object])?;
    read_history(path)
}

#[tauri::command]
pub async fn delete_project_tag(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    tag: String,
    remote: Option<String>,
    confirmed: bool,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        delete(Path::new(&path), &tag, remote.as_deref(), confirmed)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{commit_file, TempRepo};

    fn repos() -> (TempRepo, TempRepo) {
        let local = TempRepo::new();
        local.init();
        commit_file(&local, "first", "initial");
        let remote = TempRepo::new();
        git(&remote.0, &["init", "--bare"]).unwrap();
        git(
            &local.0,
            &["remote", "add", "origin", remote.0.to_str().unwrap()],
        )
        .unwrap();
        (local, remote)
    }

    #[test]
    fn selected_tag_push_does_not_send_other_tags_or_branches() {
        let (local, remote) = repos();
        git(&local.0, &["tag", "v1"]).unwrap();
        git(&local.0, &["tag", "v2"]).unwrap();
        git(&local.0, &["config", "remote.origin.mirror", "true"]).unwrap();
        git(&local.0, &["config", "push.followTags", "true"]).unwrap();
        let before = git(&local.0, &["rev-parse", "HEAD"]).unwrap();
        push(&local.0, "origin", Some("v1")).unwrap();
        assert!(git(&remote.0, &["show-ref", "--verify", "refs/tags/v1"]).is_ok());
        assert!(git(&remote.0, &["show-ref", "--verify", "refs/tags/v2"]).is_err());
        assert!(git(&remote.0, &["for-each-ref", "refs/heads/"])
            .unwrap()
            .is_empty());
        assert_eq!(before, git(&local.0, &["rev-parse", "HEAD"]).unwrap());
    }

    #[test]
    fn all_tags_preserve_annotated_objects_and_do_not_delete_remote_tags() {
        let (local, remote) = repos();
        git(&local.0, &["tag", "v1"]).unwrap();
        push(&local.0, "origin", Some("v1")).unwrap();
        git(&local.0, &["tag", "-d", "v1"]).unwrap();
        git(
            &local.0,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.com",
                "-c",
                "tag.gpgsign=false",
                "tag",
                "-a",
                "v2",
                "-m",
                "release",
            ],
        )
        .unwrap();
        push(&local.0, "origin", None).unwrap();
        assert!(git(&remote.0, &["show-ref", "--verify", "refs/tags/v1"]).is_ok());
        assert_eq!(
            git(&local.0, &["rev-parse", "refs/tags/v2"]).unwrap(),
            git(&remote.0, &["rev-parse", "refs/tags/v2"]).unwrap()
        );
    }

    #[test]
    fn refuses_remote_tag_replacement_and_invalid_inputs() {
        let (local, remote) = repos();
        git(&local.0, &["tag", "v1"]).unwrap();
        push(&local.0, "origin", Some("v1")).unwrap();
        let original = git(&remote.0, &["rev-parse", "refs/tags/v1"]).unwrap();
        commit_file(&local, "second", "next");
        git(&local.0, &["tag", "-f", "v1"]).unwrap();
        assert!(push(&local.0, "origin", Some("v1")).is_err());
        assert_eq!(
            original,
            git(&remote.0, &["rev-parse", "refs/tags/v1"]).unwrap()
        );
        for name in ["missing", "--all", "../bad"] {
            assert!(push(&local.0, "origin", Some(name)).is_err());
        }
        assert!(push(&local.0, "missing", Some("v1")).is_err());
        assert!(push(&local.0, "--all", Some("v1")).is_err());
    }
    #[test]
    fn local_deletion_preserves_remote_other_tags_and_head() {
        let (local, remote) = repos();
        git(&local.0, &["tag", "v1"]).unwrap();
        git(&local.0, &["tag", "v2"]).unwrap();
        push(&local.0, "origin", None).unwrap();
        let head = git(&local.0, &["rev-parse", "HEAD"]).unwrap();
        assert!(delete(&local.0, "v1", None, false).is_err());
        delete(&local.0, "v1", None, true).unwrap();
        assert!(git(&local.0, &["show-ref", "--verify", "refs/tags/v1"]).is_err());
        assert!(git(&local.0, &["show-ref", "--verify", "refs/tags/v2"]).is_ok());
        assert!(git(&remote.0, &["show-ref", "--verify", "refs/tags/v1"]).is_ok());
        assert_eq!(head, git(&local.0, &["rev-parse", "HEAD"]).unwrap());
    }

    #[test]
    fn explicit_remote_deletion_removes_only_selected_tag() {
        let (local, remote) = repos();
        git(&local.0, &["tag", "v1"]).unwrap();
        git(&local.0, &["tag", "v2"]).unwrap();
        push(&local.0, "origin", None).unwrap();
        git(&local.0, &["config", "remote.origin.mirror", "true"]).unwrap();
        delete(&local.0, "v1", Some("origin"), true).unwrap();
        assert!(git(&remote.0, &["show-ref", "--verify", "refs/tags/v1"]).is_err());
        assert!(git(&local.0, &["show-ref", "--verify", "refs/tags/v1"]).is_err());
        assert!(git(&remote.0, &["show-ref", "--verify", "refs/tags/v2"]).is_ok());
    }

    #[test]
    fn changed_remote_tag_and_invalid_requests_preserve_local_tag() {
        let (local, _remote) = repos();
        git(&local.0, &["tag", "v1"]).unwrap();
        push(&local.0, "origin", None).unwrap();
        commit_file(&local, "next", "next");
        git(&local.0, &["tag", "-f", "v1"]).unwrap();
        assert!(delete(&local.0, "v1", Some("origin"), true).is_err());
        assert!(delete(&local.0, "v1", Some("missing"), true).is_err());
        assert!(delete(&local.0, "../bad", None, true).is_err());
        assert!(delete(&local.0, "--all", None, true).is_err());
        assert!(git(&local.0, &["show-ref", "--verify", "refs/tags/v1"]).is_ok());
    }
    #[test]
    fn missing_remote_tag_skips_push_and_still_deletes_local_tag() {
        let (local, remote) = repos();
        git(&local.0, &["tag", "v1"]).unwrap();
        git(&local.0, &["tag", "v10"]).unwrap();
        push(&local.0, "origin", Some("v10")).unwrap();
        assert!(!remote_tag_exists(&local.0, "origin", "v1").unwrap());
        assert!(remote_tag_exists(&local.0, "origin", "v10").unwrap());
        // Reject every push: success proves an absent tag does not trigger a push.
        let hook = remote.0.join("hooks/pre-receive");
        std::fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        delete(&local.0, "v1", Some("origin"), true).unwrap();
        assert!(git(&local.0, &["show-ref", "--verify", "refs/tags/v1"]).is_err());
        assert!(remote_tag_exists(&local.0, "origin", "v10").unwrap());
    }
}
