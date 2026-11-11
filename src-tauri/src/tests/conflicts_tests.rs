use super::*;

#[test]
fn resolves_text_conflicts_with_snapshot_checks_and_completes_merge() {
    use conflicts::Resolution;
    let (repo, before) = text_merge_conflict();
    let history = read_history(&repo.0).unwrap();
    assert_eq!(history.conflicts.len(), 1);
    assert_eq!(history.operation.unwrap().kind, "merge");
    let file = conflicts::read(&repo.0, "file.txt").unwrap();
    assert_eq!(file.base.text.as_deref(), Some("base"));
    assert_eq!(file.ours.text.as_deref(), Some("main"));
    assert_eq!(file.theirs.text.as_deref(), Some("topic"));
    assert!(file.editable);
    assert!(file.working_text.as_ref().unwrap().contains("<<<<<<<"));
    assert!(
        conflicts::resolve(
            &repo.0,
            "file.txt",
            &file.token,
            Resolution::Manual {
                content: file.working_text.unwrap()
            }
        )
        .is_err()
    );
    std::fs::write(repo.0.join("file.txt"), "external edit").unwrap();
    assert!(
        conflicts::resolve(
            &repo.0,
            "file.txt",
            &file.token,
            Resolution::Manual {
                content: "stale overwrite".into()
            }
        )
        .is_err()
    );
    assert_eq!(
        std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
        "external edit"
    );
    let current = conflicts::read(&repo.0, "file.txt").unwrap();
    let resolved = conflicts::resolve(
        &repo.0,
        "file.txt",
        &current.token,
        Resolution::Manual {
            content: "combined result".into(),
        },
    )
    .unwrap();
    assert!(resolved.conflicts.is_empty());
    assert!(resolved.operation.as_ref().unwrap().staged);
    assert_eq!(
        git(&repo.0, &["show", ":file.txt"]).unwrap(),
        "combined result"
    );
    let completed = commit_ops::run(
        &repo.0,
        &before.tip,
        &before.current_branch,
        commit_ops::Action::Continue,
    )
    .unwrap();
    assert!(completed.operation.is_none());
    assert_eq!(completed.commits[0].parents.len(), 2);
    assert!(!completed.has_changes);
    assert!(conflicts::resolve(&repo.0, "file.txt", &current.token, Resolution::Ours).is_err());
    assert!(conflicts::read(&repo.0, "../file.txt").is_err());
}

#[test]
fn resolves_modify_delete_and_binary_conflicts_without_corrupting_contents() {
    use conflicts::Resolution;
    let repo = commit_operation_repo();
    let base = read_history(&repo.0).unwrap();
    git(&repo.0, &["switch", "-c", "topic"]).unwrap();
    git(&repo.0, &["rm", "file.txt"]).unwrap();
    commit_all(&repo, "Delete file");
    git(&repo.0, &["switch", &base.current_branch]).unwrap();
    commit_file(&repo, "main edit", "Edit");
    std::fs::write(repo.0.join("untracked.md"), "keep").unwrap();
    assert!(git(&repo.0, &["merge", "--no-edit", "topic"]).is_err());
    let file = conflicts::read(&repo.0, "file.txt").unwrap();
    assert!(file.ours.exists);
    assert!(!file.theirs.exists);
    let deleted =
        conflicts::resolve(&repo.0, "file.txt", &file.token, Resolution::Theirs).unwrap();
    assert!(!repo.0.join("file.txt").exists());
    assert!(deleted.conflicts.is_empty());
    assert_eq!(
        std::fs::read_to_string(repo.0.join("untracked.md")).unwrap(),
        "keep"
    );
    let binary = commit_operation_repo();
    std::fs::write(binary.0.join("bin[1].dat"), [0, 1, 2, 255]).unwrap();
    commit_all(&binary, "Binary base");
    let initial = read_history(&binary.0).unwrap();
    git(&binary.0, &["switch", "-c", "topic"]).unwrap();
    std::fs::write(binary.0.join("bin[1].dat"), [0, 3, 4, 255]).unwrap();
    commit_all(&binary, "Binary topic");
    git(&binary.0, &["switch", &initial.current_branch]).unwrap();
    std::fs::write(binary.0.join("bin[1].dat"), [0, 5, 6, 255]).unwrap();
    commit_all(&binary, "Binary main");
    assert!(git(&binary.0, &["merge", "--no-edit", "topic"]).is_err());
    let file = conflicts::read(&binary.0, "bin[1].dat").unwrap();
    assert!(file.ours.binary && file.theirs.binary);
    assert!(!file.editable);
    assert!(
        conflicts::resolve(
            &binary.0,
            "bin[1].dat",
            &file.token,
            Resolution::Manual {
                content: "wrong".into()
            }
        )
        .is_err()
    );
    let resolved =
        conflicts::resolve(&binary.0, "bin[1].dat", &file.token, Resolution::Theirs).unwrap();
    assert!(resolved.conflicts.is_empty());
    assert_eq!(
        std::fs::read(binary.0.join("bin[1].dat")).unwrap(),
        vec![0, 3, 4, 255]
    );
}

#[cfg(unix)]
#[test]
fn conflict_editor_does_not_follow_symlinks_outside_repository() {
    let (repo, _) = text_merge_conflict();
    let outside = TempRepo::new();
    std::fs::write(outside.0.join("private.txt"), "do not touch").unwrap();
    std::fs::remove_file(repo.0.join("file.txt")).unwrap();
    std::os::unix::fs::symlink(outside.0.join("private.txt"), repo.0.join("file.txt")).unwrap();
    let file = conflicts::read(&repo.0, "file.txt").unwrap();
    assert!(!file.editable);
    assert!(
        conflicts::resolve(
            &repo.0,
            "file.txt",
            &file.token,
            conflicts::Resolution::Manual {
                content: "unsafe".into()
            }
        )
        .is_err()
    );
    conflicts::resolve(
        &repo.0,
        "file.txt",
        &file.token,
        conflicts::Resolution::Theirs,
    )
    .unwrap();
    assert_eq!(
        std::fs::read_to_string(outside.0.join("private.txt")).unwrap(),
        "do not touch"
    );
    assert!(
        !std::fs::symlink_metadata(repo.0.join("file.txt"))
            .unwrap()
            .file_type()
            .is_symlink()
    );
    assert_eq!(
        std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
        "topic"
    );
}
