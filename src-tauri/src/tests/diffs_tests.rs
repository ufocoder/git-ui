use super::*;

#[test]
fn commit_files_and_diff_handle_root_renames_deletions_and_literal_paths() {
    let repo = TempRepo::new();
    repo.init();
    for file in ["a[1].txt", "old name.txt", "deleted.txt"] {
        std::fs::write(repo.0.join(file), format!("original {file}\n")).unwrap();
    }
    std::fs::write(repo.0.join("binary.dat"), [0, 1, 2]).unwrap();
    commit_all(&repo, "Initial files");
    let root = read_history(&repo.0).unwrap().tip;
    let files = read_commit_files(&repo.0, &root).unwrap();
    assert_eq!(files.len(), 4);
    assert!(files.iter().all(|file| file.status == "A"));
    assert!(
        read_file_diff(&repo.0, &root, "a[1].txt")
            .unwrap()
            .patch
            .contains("+original a[1].txt")
    );
    git(&repo.0, &["mv", "old name.txt", "new name.txt"]).unwrap();
    std::fs::remove_file(repo.0.join("deleted.txt")).unwrap();
    std::fs::write(repo.0.join("a[1].txt"), "committed change\n").unwrap();
    std::fs::write(repo.0.join("binary.dat"), [0, 3, 4]).unwrap();
    commit_all(&repo, "Changes");
    let tip = read_history(&repo.0).unwrap().tip;
    let files = read_commit_files(&repo.0, &tip).unwrap();
    assert_eq!(files.len(), 4);
    let renamed = files
        .iter()
        .find(|file| file.path == "new name.txt")
        .unwrap();
    assert_eq!(renamed.status, "R");
    assert_eq!(renamed.old_path.as_deref(), Some("old name.txt"));
    assert_eq!(
        files
            .iter()
            .find(|file| file.path == "deleted.txt")
            .unwrap()
            .status,
        "D"
    );
    std::fs::write(repo.0.join("a[1].txt"), "uncommitted change").unwrap();
    let patch = read_file_diff(&repo.0, &tip, "a[1].txt").unwrap().patch;
    assert!(patch.contains("-original a[1].txt"));
    assert!(patch.contains("+committed change"));
    assert!(!patch.contains("uncommitted"));
    assert!(
        read_file_diff(&repo.0, &tip, "new name.txt")
            .unwrap()
            .patch
            .contains("rename from old name.txt")
    );
    assert!(
        read_file_diff(&repo.0, &tip, "binary.dat")
            .unwrap()
            .patch
            .contains("Binary files")
    );
    assert!(read_file_diff(&repo.0, &tip, "not-in-commit.txt").is_err());
    assert!(read_commit_files(&repo.0, "--all").is_err());
}

#[test]
fn empty_commit_has_no_changed_files() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "base", "Base");
    git(
        &repo.0,
        &[
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.com",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-m",
            "Empty",
        ],
    )
    .unwrap();
    assert!(
        read_commit_files(&repo.0, &read_history(&repo.0).unwrap().tip)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn commit_details_include_full_message_and_files() {
    let repo = TempRepo::new();
    repo.init();
    std::fs::write(repo.0.join("file.txt"), "base").unwrap();
    commit_all(&repo, "Subject\n\nDetailed explanation\nSecond line");
    let tip = read_history(&repo.0).unwrap().tip;
    let details = read_commit_details(&repo.0, &tip).unwrap();
    assert_eq!(
        details.message,
        "Subject\n\nDetailed explanation\nSecond line"
    );
    assert_eq!(details.files.len(), 1);
    assert_eq!(details.files[0].path, "file.txt");
}

#[test]
fn uncommitted_changes_include_staged_unstaged_and_new_files() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "base\n", "Base");
    assert!(!read_history(&repo.0).unwrap().has_changes);
    std::fs::write(repo.0.join("file.txt"), "staged\n").unwrap();
    git(&repo.0, &["add", "file.txt"]).unwrap();
    std::fs::write(repo.0.join("file.txt"), "working\n").unwrap();
    std::fs::write(repo.0.join("new[1].txt"), "new content\n").unwrap();
    assert!(read_history(&repo.0).unwrap().has_changes);
    let files = read_commit_files(&repo.0, WORKTREE).unwrap();
    assert_eq!(files.len(), 2);
    assert!(
        files
            .iter()
            .any(|file| file.path == "new[1].txt" && file.status == "A")
    );
    let snapshot = read_history(&repo.0).unwrap().worktree_files;
    assert_eq!(snapshot.len(), files.len());
    let partially_staged = snapshot.iter().find(|file| file.path == "file.txt").unwrap();
    assert!(partially_staged.staged);
    assert!(partially_staged.partially_staged);
    let patch = read_file_diff(&repo.0, WORKTREE, "file.txt").unwrap().patch;
    assert!(patch.contains("-base"));
    assert!(patch.contains("+working"));
    assert!(!patch.contains("+staged"));
    assert!(
        read_file_diff(&repo.0, WORKTREE, "new[1].txt")
            .unwrap()
            .patch
            .contains("+new content")
    );
    commit_all(&repo, "Save changes before rename");
    git(&repo.0, &["mv", "file.txt", "renamed.txt"]).unwrap();
    assert!(
        read_worktree_files(&repo.0)
            .unwrap()
            .iter()
            .any(|file| file.path == "renamed.txt"
                && file.old_path.as_deref() == Some("file.txt"))
    );
}

#[test]
fn uncommitted_changes_work_before_first_commit() {
    let repo = TempRepo::new();
    repo.init();
    std::fs::write(repo.0.join("first.txt"), "first\n").unwrap();
    git(&repo.0, &["add", "first.txt"]).unwrap();
    assert!(read_history(&repo.0).unwrap().has_changes);
    assert!(
        read_file_diff(&repo.0, WORKTREE, "first.txt")
            .unwrap()
            .patch
            .contains("+first")
    );
}

#[test]
fn staging_and_commit_include_only_selected_files() {
    let repo = TempRepo::new();
    repo.init();
    configure_committer(&repo);
    commit_file(&repo, "base", "Base");
    std::fs::write(repo.0.join("file.txt"), "updated").unwrap();
    std::fs::write(repo.0.join("new[1].txt"), "new").unwrap();
    assert!(commit_staged(&repo.0, "Nothing").is_err());
    let details = set_file_staged(&repo.0, "file.txt", true).unwrap();
    assert!(
        details
            .files
            .iter()
            .find(|file| file.path == "file.txt")
            .unwrap()
            .staged
    );
    assert!(
        !details
            .files
            .iter()
            .find(|file| file.path == "new[1].txt")
            .unwrap()
            .staged
    );
    assert!(commit_staged(&repo.0, " ").is_err());
    let history = commit_staged(&repo.0, "Selected changes").unwrap();
    assert!(history.has_changes);
    assert_eq!(history.commits[0].subject, "Selected changes");
    assert_eq!(read_commit_files(&repo.0, &history.tip).unwrap().len(), 1);
    assert_eq!(read_worktree_files(&repo.0).unwrap()[0].path, "new[1].txt");
    set_file_staged(&repo.0, "new[1].txt", true).unwrap();
    set_file_staged(&repo.0, "new[1].txt", false).unwrap();
    assert_eq!(
        std::fs::read_to_string(repo.0.join("new[1].txt")).unwrap(),
        "new"
    );
    assert!(!read_worktree_files(&repo.0).unwrap()[0].staged);
}

#[test]
fn staging_unstaging_and_committing_work_before_first_commit() {
    let repo = TempRepo::new();
    repo.init();
    configure_committer(&repo);
    std::fs::write(repo.0.join("first.txt"), "first").unwrap();
    set_file_staged(&repo.0, "first.txt", true).unwrap();
    set_file_staged(&repo.0, "first.txt", false).unwrap();
    assert!(repo.0.join("first.txt").exists());
    assert!(!read_worktree_files(&repo.0).unwrap()[0].staged);
    set_file_staged(&repo.0, "first.txt", true).unwrap();
    let history = commit_staged(&repo.0, "Initial").unwrap();
    assert!(!history.has_changes);
    assert_eq!(history.commits.len(), 1);
}

#[test]
fn staging_handles_deletions_and_unstaging_renames_without_changing_files() {
    let repo = TempRepo::new();
    repo.init();
    configure_committer(&repo);
    commit_file(&repo, "base", "Base");
    git(&repo.0, &["mv", "file.txt", "new.txt"]).unwrap();
    set_file_staged(&repo.0, "new.txt", true).unwrap();
    set_file_staged(&repo.0, "new.txt", false).unwrap();
    assert!(repo.0.join("new.txt").exists());
    assert!(!repo.0.join("file.txt").exists());
    set_file_staged(&repo.0, "file.txt", true).unwrap();
    commit_staged(&repo.0, "Delete original").unwrap();
    assert!(repo.0.join("new.txt").exists());
}

#[test]
fn scoped_diffs_separate_index_and_worktree_for_partial_staging() {
    let repo = commit_operation_repo();
    std::fs::write(repo.0.join("file.txt"), "index version").unwrap();
    set_file_staged(&repo.0, "file.txt", true).unwrap();
    std::fs::write(repo.0.join("file.txt"), "working version").unwrap();
    let staged = read_worktree_diff_scoped(&repo.0, "file.txt", Some(WorktreeDiffScope::Staged)).unwrap();
    assert!(staged.patch.contains("-base"));
    assert!(staged.patch.contains("+index version"));
    assert!(!staged.patch.contains("+working version"));
    let unstaged = read_worktree_diff_scoped(&repo.0, "file.txt", Some(WorktreeDiffScope::Unstaged)).unwrap();
    assert!(unstaged.patch.contains("-index version"));
    assert!(unstaged.patch.contains("+working version"));
    std::fs::write(repo.0.join("new[1].txt"), "untracked").unwrap();
    assert!(read_worktree_diff_scoped(&repo.0, "new[1].txt", Some(WorktreeDiffScope::Unstaged)).unwrap().patch.contains("+untracked"));
    assert!(read_worktree_diff_scoped(&repo.0, "new[1].txt", Some(WorktreeDiffScope::Staged)).is_err());
}

#[test]
fn scoped_staged_diff_works_before_first_commit() {
    let repo = TempRepo::new();
    repo.init();
    std::fs::write(repo.0.join("first.txt"), "initial").unwrap();
    set_file_staged(&repo.0, "first.txt", true).unwrap();
    assert!(read_worktree_diff_scoped(&repo.0, "first.txt", Some(WorktreeDiffScope::Staged)).unwrap().patch.contains("+initial"));
}

#[test]
fn partial_staging_commits_index_snapshot_and_preserves_later_edits() {
    let repo = TempRepo::new();
    repo.init();
    configure_committer(&repo);
    commit_file(&repo, "base", "Base");
    std::fs::write(repo.0.join("file.txt"), "staged version").unwrap();
    set_file_staged(&repo.0, "file.txt", true).unwrap();
    std::fs::write(repo.0.join("file.txt"), "later edit").unwrap();
    let file = read_worktree_files(&repo.0).unwrap().remove(0);
    assert!(file.staged && file.partially_staged);
    let history = commit_staged(&repo.0, "Index only").unwrap();
    assert!(history.has_changes);
    assert_eq!(
        git(&repo.0, &["show", "HEAD:file.txt"]).unwrap(),
        "staged version"
    );
    assert_eq!(
        std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
        "later edit"
    );
    assert!(!read_worktree_files(&repo.0).unwrap()[0].staged);
}
