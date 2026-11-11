use super::*;

#[test]
#[cfg(debug_assertions)]
fn switching_running_sources_is_rejected_before_git_can_modify_files() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let before = git(source, &["rev-parse", "HEAD"]).unwrap();
    // Even invalid targets must be rejected before any checkout is attempted.
    assert_eq!(switch_branch(source, "invalid-target").unwrap_err(), locale::text("dev.source-checkout"));
    assert_eq!(checkout_commit(source, "HEAD").unwrap_err(), locale::text("dev.source-checkout"));
    assert_eq!(before, git(source, &["rev-parse", "HEAD"]).unwrap());
}

#[test]
fn switching_branch_updates_files_and_history() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "original", "Base commit");
    let original = read_history(&repo.0).unwrap().current_branch;
    git(&repo.0, &["switch", "-c", "feature/test"]).unwrap();
    commit_file(&repo, "feature", "Feature commit");
    let history = switch_branch(&repo.0, &original).unwrap();
    assert_eq!(history.current_branch, original);
    assert_eq!(history.commits.iter().find(|commit| commit.hash == history.tip).unwrap().subject, "Base commit");
    assert!(history.branches.contains(&"feature/test".into()));
    assert_eq!(
        std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
        "original"
    );
    assert_eq!(
        switch_branch(&repo.0, "feature/test").unwrap().commits[0].subject,
        "Feature commit"
    );
}

#[test]
fn switching_rejects_unknown_branch_and_preserves_conflicting_edits() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "original", "Base commit");
    let original = read_history(&repo.0).unwrap().current_branch;
    git(&repo.0, &["switch", "-c", "feature"]).unwrap();
    commit_file(&repo, "feature", "Feature commit");
    std::fs::write(repo.0.join("file.txt"), "unsaved").unwrap();
    assert!(switch_branch(&repo.0, &original).is_err());
    assert!(switch_branch(&repo.0, "--detach").is_err());
    assert_eq!(read_history(&repo.0).unwrap().current_branch, "feature");
    assert_eq!(
        std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
        "unsaved"
    );
}

#[test]
fn creates_branch_at_selected_commit_without_switching_or_changing_files() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "first", "First");
    let first = read_history(&repo.0).unwrap().tip;
    commit_file(&repo, "second", "Second");
    let before = read_history(&repo.0).unwrap();
    std::fs::write(repo.0.join("file.txt"), "local changes").unwrap();
    let after = create_branch_at_commit(&repo.0, "feature/from-first", &first).unwrap();
    assert_eq!(after.current_branch, before.current_branch);
    assert_eq!(after.tip, before.tip);
    assert_eq!(
        git(&repo.0, &["rev-parse", "refs/heads/feature/from-first"])
            .unwrap()
            .trim(),
        first
    );
    assert_eq!(
        std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
        "local changes"
    );
    assert!(create_branch_at_commit(&repo.0, "feature/from-first", &before.tip).is_err());
    assert!(create_branch_at_commit(&repo.0, "-invalid", &first).is_err());
    assert!(create_branch_at_commit(&repo.0, "feature/invalid-target", "WORKTREE").is_err());
    assert!(create_branch_at_commit(&repo.0, "feature/invalid-target", "not-a-sha").is_err());
}

#[test]
fn creates_branch_at_head_and_preserves_working_changes() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "base", "Base");
    let before = read_history(&repo.0).unwrap();
    std::fs::write(repo.0.join("file.txt"), "local changes").unwrap();
    let after = create_branch(&repo.0, "feature/new-screen").unwrap();
    assert_eq!(after.current_branch, "feature/new-screen");
    assert_eq!(after.tip, before.tip);
    assert!(after.branches.contains(&"feature/new-screen".into()));
    assert_eq!(
        std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
        "local changes"
    );
}

#[test]
fn rejects_invalid_duplicate_and_unborn_branch_creation() {
    let repo = TempRepo::new();
    repo.init();
    assert!(
        create_branch(&repo.0, "feature")
            .unwrap_err()
            .contains("первый коммит")
    );
    commit_file(&repo, "base", "Base");
    let before = read_history(&repo.0).unwrap();
    for name in [
        "",
        "invalid name",
        "-bad",
        "@{-1}",
        "trailing/",
        " feature",
        "a..b",
        &before.current_branch,
    ] {
        assert!(create_branch(&repo.0, name).is_err(), "accepted {name}");
    }
    let after = read_history(&repo.0).unwrap();
    assert_eq!(after.current_branch, before.current_branch);
    assert_eq!(after.branches, before.branches);
}

#[test]
fn lists_tags_and_configured_remotes_without_network() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "base", "Base");
    git(&repo.0, &["tag", "release/v1"]).unwrap();
    git(
        &repo.0,
        &["remote", "add", "origin", "https://example.com/repo.git"],
    )
    .unwrap();
    git(
        &repo.0,
        &[
            "remote",
            "add",
            "upstream",
            "https://example.com/upstream.git",
        ],
    )
    .unwrap();
    git(&repo.0, &["update-ref", "refs/remotes/origin/main", "HEAD"]).unwrap();
    git(
        &repo.0,
        &[
            "symbolic-ref",
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/main",
        ],
    )
    .unwrap();
    let history = read_history(&repo.0).unwrap();
    assert_eq!(history.tags, vec!["release/v1"]);
    assert_eq!(history.remotes.len(), 2);
    assert_eq!(history.remotes[0].name, "origin");
    assert_eq!(history.remotes[0].branches, vec!["main"]);
    assert_eq!(history.remotes[1].name, "upstream");
    assert!(history.remotes[1].branches.is_empty());
}

#[test]
fn creates_tags_and_remotes_and_rejects_invalid_or_duplicate_names() {
    let repo = TempRepo::new();
    repo.init();
    assert!(create_tag(&repo.0, "v1").is_err());
    assert_eq!(
        add_remote(&repo.0, "origin", "/local/repository.git")
            .unwrap()
            .remotes[0]
            .name,
        "origin"
    );
    assert!(add_remote(&repo.0, "origin", "/other.git").is_err());
    assert!(add_remote(&repo.0, "bad name", "/other.git").is_err());
    assert!(add_remote(&repo.0, "upstream", "").is_err());
    commit_file(&repo, "base", "Base");
    let tip = read_history(&repo.0).unwrap().tip;
    assert_eq!(
        create_tag(&repo.0, "release/v1").unwrap().tags,
        vec!["release/v1"]
    );
    assert_eq!(
        git(&repo.0, &["rev-parse", "refs/tags/release/v1"])
            .unwrap()
            .trim(),
        tip
    );
    assert!(create_tag(&repo.0, "release/v1").is_err());
    assert!(create_tag(&repo.0, "bad name").is_err());
    assert!(create_tag(&repo.0, "--force").is_err());
}

#[test]
fn checkout_and_tag_use_selected_commit_without_moving_branch() {
    let repo = TempRepo::new();
    repo.init();
    configure_committer(&repo);
    commit_file(&repo, "base", "Base");
    let base = read_history(&repo.0).unwrap().tip;
    commit_file(&repo, "next", "Next");
    let before = read_history(&repo.0).unwrap();
    create_tag_at_commit(&repo.0, "old-release", &base).unwrap();
    assert_eq!(
        git(&repo.0, &["rev-parse", "old-release"]).unwrap().trim(),
        base
    );
    let checked = checkout_commit(&repo.0, &base).unwrap();
    assert!(checked.current_branch.is_empty());
    assert_eq!(checked.tip, base);
    assert_eq!(
        git(&repo.0, &["rev-parse", &before.current_branch])
            .unwrap()
            .trim(),
        before.tip
    );
    assert!(reset_branch_to_commit(&repo.0, &base, "mixed", false).is_err());
    assert!(checkout_commit(&repo.0, "WORKTREE").is_err());
}

#[test]
fn reset_rejects_changed_head_or_branch_before_touching_files() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "base", "Base");
    let first = read_history(&repo.0).unwrap();
    commit_file(&repo, "next", "Next");
    let current = read_history(&repo.0).unwrap();
    std::fs::write(repo.0.join("file.txt"), "keep these edits").unwrap();
    assert!(reset_branch_to_commit_checked(&repo.0, &first.tip, "hard", true, &first.tip, &current.current_branch).is_err());
    assert!(reset_branch_to_commit_checked(&repo.0, &first.tip, "hard", true, &current.tip, "another-branch").is_err());
    assert_eq!(read_history(&repo.0).unwrap().tip, current.tip);
    assert_eq!(std::fs::read_to_string(repo.0.join("file.txt")).unwrap(), "keep these edits");
}

#[test]
fn reset_modes_preserve_or_discard_changes_as_requested() {
    for mode in ["soft", "mixed", "hard"] {
        let repo = TempRepo::new();
        repo.init();
        configure_committer(&repo);
        commit_file(&repo, "base", "Base");
        let base = read_history(&repo.0).unwrap().tip;
        commit_file(&repo, "next", "Next");
        std::fs::write(repo.0.join("file.txt"), "local edits").unwrap();
        if mode == "hard" {
            assert!(reset_branch_to_commit(&repo.0, &base, mode, false).is_err());
        }
        let result = reset_branch_to_commit(&repo.0, &base, mode, mode == "hard").unwrap();
        assert_eq!(result.tip, base);
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            if mode == "hard" {
                "base"
            } else {
                "local edits"
            }
        );
        let staged = git(&repo.0, &["diff", "--cached", "--name-only"]).unwrap();
        assert_eq!(!staged.is_empty(), mode == "soft");
    }
}
