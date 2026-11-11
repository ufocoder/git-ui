use super::*;

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
