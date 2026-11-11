use super::*;

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
