use super::*;

#[test]
fn branch_history_switches_scope_without_checking_out_or_losing_pagination() {
    let repo = TempRepo::new(); repo.init(); commit_file(&repo, "base", "base");
    let main = git(&repo.0, &["branch", "--show-current"]).unwrap();
    git(&repo.0, &["checkout", "-b", "side"]).unwrap();
    for i in 0..PAGE_SIZE + 2 { commit_file(&repo, &format!("side {i}"), &format!("Side {i}")); }
    let side_tip = git(&repo.0, &["rev-parse", "HEAD"]).unwrap().trim().to_owned();
    git(&repo.0, &["checkout", main.trim()]).unwrap();
    commit_file(&repo, "main", "Main only");
    let history = read_history(&repo.0).unwrap();
    assert_eq!(history.branch_tips["refs/heads/side"], side_tip);
    let tips: Vec<String> = history.branch_tips.values().cloned().collect();
    let mut all = history.commits;
    let mut more = history.has_more;
    while more {
        let page = read_branch_commit_page_at_tips(&repo.0, &history.tip, all.len(), true, Some(&tips)).unwrap();
        more = page.has_more; all.extend(page.commits);
    }
    assert!(all.iter().any(|commit| commit.hash == side_tip));
    assert!(all.iter().any(|commit| commit.subject == "Main only"));
    assert_eq!(all.len(), PAGE_SIZE + 4);
    assert_eq!(all.iter().map(|commit| &commit.hash).collect::<std::collections::HashSet<_>>().len(), all.len());
    let current = read_branch_commit_page(&repo.0, &history.tip, 0, false).unwrap();
    assert_eq!(current.commits.len(), 2);
    let selected = read_branch_commit_page(&repo.0, &side_tip, 0, false).unwrap();
    assert!(selected.has_more);
    assert!(!selected.commits.iter().any(|commit| commit.subject == "Main only"));
    let filter = history_search::HistoryFilter { text: "Side".into(), ..Default::default() };
    assert!(history_search::page_with_branches(&repo.0, &history.tip, None, "all", &filter, 0, false).unwrap().commits.is_empty());
    assert_eq!(history_search::page_with_branches(&repo.0, &history.tip, None, "all", &filter, 0, true).unwrap().commits.len(), PAGE_SIZE);
    let sha_filter = history_search::HistoryFilter { sha: side_tip[..8].into(), ..Default::default() };
    let matches = history_search::page_with_branches(&repo.0, &history.tip, None, "all", &sha_filter, 0, true).unwrap();
    assert_eq!(matches.commits.len(), 1);
    assert_eq!(matches.commits[0].hash, side_tip);
    assert_eq!(git(&repo.0, &["branch", "--show-current"]).unwrap(), main);
}

#[test]
fn empty_repository_has_no_commits() {
    let repo = TempRepo::new();
    repo.init();
    assert!(read_history(&repo.0).unwrap().commits.is_empty());
}

#[test]
fn paginates_history_with_metadata() {
    let repo = TempRepo::new();
    repo.init();
    for n in 0..65 {
        git(
            &repo.0,
            &[
                "-c",
                "user.name=Test Author",
                "-c",
                "user.email=test@example.com",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--allow-empty",
                "-m",
                &format!("Коммит {n}"),
            ],
        )
        .unwrap();
    }
    let history = read_history(&repo.0).unwrap();
    assert_eq!(history.commits.len(), PAGE_SIZE);
    assert!(history.has_more);
    assert_eq!(history.commits[0].parents[0], history.commits[1].hash);
    commit_file(&repo, "new", "Commit after first page");
    let tips: Vec<String> = history.branch_tips.values().cloned().collect();
    let second = read_branch_commit_page_at_tips(&repo.0, &history.tip, PAGE_SIZE, true, Some(&tips)).unwrap();
    assert_eq!(second.commits.len(), 15);
    assert!(!second.has_more);
    assert_eq!(second.commits[0].subject, "Коммит 14");
    assert_eq!(second.commits[14].subject, "Коммит 0");
    assert_eq!(history.commits[0].subject, "Коммит 64");
    assert_eq!(history.commits[9].subject, "Коммит 55");
    assert_eq!(history.commits[0].author, "Test Author");
    assert_eq!(history.commits[0].hash.len(), 40);
    assert!(!history.commits[0].date.is_empty());
}

#[test]
fn history_includes_merge_parents_and_rejects_invalid_cursor() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "base", "Base");
    let original = read_history(&repo.0).unwrap().current_branch;
    git(&repo.0, &["switch", "-c", "feature"]).unwrap();
    commit_file(&repo, "feature", "Feature");
    git(&repo.0, &["switch", &original]).unwrap();
    git(
        &repo.0,
        &[
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.com",
            "-c",
            "commit.gpgsign=false",
            "merge",
            "--no-ff",
            "feature",
            "-m",
            "Merge feature",
        ],
    )
    .unwrap();
    let history = read_history(&repo.0).unwrap();
    assert_eq!(history.commits[0].parents.len(), 2);
    let files = read_commit_files(&repo.0, &history.tip).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, "file.txt");
    assert!(
        read_file_diff(&repo.0, &history.tip, "file.txt")
            .unwrap()
            .patch
            .contains("+feature")
    );
    assert!(history.commits.last().unwrap().parents.is_empty());
    assert!(read_commit_page(&repo.0, "--all", 0).is_err());
}

#[test]
fn history_search_filters_all_pages_by_message_author_path_and_sha() {
    use history_search::HistoryFilter;
    let repo = TempRepo::new();
    repo.init();
    std::fs::create_dir_all(repo.0.join("src")).unwrap();
    let mut oldest = String::new();
    for n in 0..PAGE_SIZE + 4 {
        std::fs::write(repo.0.join("src/a[1].txt"), n.to_string()).unwrap();
        git(&repo.0, &["add", "--all"]).unwrap();
        git(
            &repo.0,
            &[
                "-c",
                "user.name=Alpha[1]",
                "-c",
                "user.email=alpha@example.com",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-m",
                &format!("2026 Fix [ui] {n}"),
            ],
        )
        .unwrap();
        if n == 0 {
            oldest = git(&repo.0, &["rev-parse", "HEAD"])
                .unwrap()
                .trim()
                .to_string();
        }
    }
    for n in 0..20 {
        commit_file(&repo, &format!("noise {n}"), "Other changes");
    }
    let snapshot = read_history(&repo.0).unwrap();
    assert!(!snapshot.commits.iter().any(|commit| commit.hash == oldest));
    let filter = HistoryFilter {
        text: "fIX [UI]".into(),
        sha: String::new(),
        author: "alpha[1]".into(),
        file: "src/a[1].txt".into(),
    };
    let first = history_search::page(&repo.0, &snapshot.tip, None, "all", &filter, 0).unwrap();
    assert_eq!(first.commits.len(), PAGE_SIZE);
    assert!(first.has_more);
    assert!(
        first
            .commits
            .iter()
            .all(|commit| commit.author == "Alpha[1]")
    );
    let second =
        history_search::page(&repo.0, &snapshot.tip, None, "all", &filter, PAGE_SIZE).unwrap();
    assert_eq!(second.commits.len(), 4);
    assert!(!second.has_more);
    assert_eq!(second.commits.last().unwrap().hash, oldest);
    let sha = HistoryFilter {
        text: oldest[..8].to_uppercase(),
        ..filter.clone()
    };
    let result = history_search::page(&repo.0, &snapshot.tip, None, "all", &sha, 0).unwrap();
    assert_eq!(result.commits.len(), 1);
    assert_eq!(result.commits[0].hash, oldest);
    let explicit_sha = HistoryFilter {
        sha: oldest[..8].to_uppercase(),
        ..filter.clone()
    };
    assert_eq!(
        history_search::page(&repo.0, &snapshot.tip, None, "all", &explicit_sha, 0)
            .unwrap()
            .commits[0]
            .hash,
        oldest
    );
    let wrong_text = HistoryFilter {
        text: "No matching message".into(),
        ..explicit_sha.clone()
    };
    assert!(
        history_search::page(&repo.0, &snapshot.tip, None, "all", &wrong_text, 0)
            .unwrap()
            .commits
            .is_empty()
    );
    let short_sha = HistoryFilter {
        sha: "ab".into(),
        ..filter.clone()
    };
    assert!(
        history_search::page(&repo.0, &snapshot.tip, None, "all", &short_sha, 0)
            .unwrap()
            .commits
            .is_empty()
    );
    let numeric_message = HistoryFilter {
        text: "2026".into(),
        ..filter.clone()
    };
    assert_eq!(
        history_search::page(
            &repo.0,
            &snapshot.tip,
            None,
            "all",
            &numeric_message,
            PAGE_SIZE
        )
        .unwrap()
        .commits
        .len(),
        4
    );
    let folder = HistoryFilter {
        file: "src".into(),
        ..Default::default()
    };
    assert!(
        history_search::page(&repo.0, &snapshot.tip, None, "all", &folder, 0)
            .unwrap()
            .has_more
    );
    let missing_author = HistoryFilter {
        author: "Nobody".into(),
        ..filter.clone()
    };
    assert!(
        history_search::page(&repo.0, &snapshot.tip, None, "all", &missing_author, 0)
            .unwrap()
            .commits
            .is_empty()
    );
    let wrong_file = HistoryFilter {
        file: "src/a1.txt".into(),
        ..filter.clone()
    };
    assert!(
        history_search::page(&repo.0, &snapshot.tip, None, "all", &wrong_file, 0)
            .unwrap()
            .commits
            .is_empty()
    );
    for file in ["../file.txt", "/file.txt"] {
        assert!(
            history_search::page(
                &repo.0,
                &snapshot.tip,
                None,
                "all",
                &HistoryFilter {
                    file: file.into(),
                    ..Default::default()
                },
                0
            )
            .is_err()
        );
    }
    assert!(history_search::page(&repo.0, "--all", None, "all", &filter, 0).is_err());
    assert!(
        history_search::page(
            &repo.0,
            &snapshot.tip,
            None,
            "all",
            &HistoryFilter {
                text: "bad\0value".into(),
                ..Default::default()
            },
            0
        )
        .is_err()
    );
    commit_file(&repo, "newer", "2026 Fix [ui] after snapshot");
    assert_eq!(
        history_search::page(&repo.0, &snapshot.tip, None, "all", &filter, PAGE_SIZE)
            .unwrap()
            .commits
            .len(),
        4
    );
}

#[test]
fn does_not_offer_initialization_for_missing_paths_or_existing_git_metadata() {
    let repo = TempRepo::new();
    assert!(can_initialize_repository(&repo.0.join("missing")).is_err());
    std::fs::write(repo.0.join(".git"), "existing metadata").unwrap();
    assert!(!can_initialize_repository(&repo.0).unwrap());
    assert!(initialize_repository(&repo.0).is_err());
    assert_eq!(
        std::fs::read_to_string(repo.0.join(".git")).unwrap(),
        "existing metadata"
    );
}

#[test]
fn commit_rows_include_branch_remote_and_annotated_tag_labels() {
    let repo = TempRepo::new();
    repo.init();
    configure_committer(&repo);
    commit_file(&repo, "base", "Base");
    let initial = read_history(&repo.0).unwrap();
    git(&repo.0, &["tag", "plain"]).unwrap();
    git(&repo.0, &["tag", "-a", "annotated", "-m", "Release"]).unwrap();
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
    let row = read_history(&repo.0).unwrap().commits.remove(0);
    for (name, kind) in [
        (initial.current_branch.as_str(), "branch"),
        ("plain", "tag"),
        ("annotated", "tag"),
        ("origin/main", "remote"),
    ] {
        assert!(
            row.refs
                .iter()
                .any(|reference| reference.name == name && reference.kind == kind)
        );
    }
    assert!(
        !row.refs
            .iter()
            .any(|reference| reference.name == "origin/HEAD")
    );
    commit_file(&repo, "next", "Next");
    let history = read_history(&repo.0).unwrap();
    assert!(
        !history.commits[0]
            .refs
            .iter()
            .any(|reference| reference.kind == "tag")
    );
    assert!(
        history.commits[1]
            .refs
            .iter()
            .any(|reference| reference.name == "annotated")
    );
}

#[test]
fn missing_git_lfs_keeps_history_available() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "base", "base");
    std::fs::write(repo.0.join(".gitattributes"), "file.txt filter=lfs\n").unwrap();
    git(&repo.0, &["config", "filter.lfs.process", "echo 'git-lfs: command not found' >&2; exit 127"]).unwrap();
    git(&repo.0, &["config", "filter.lfs.required", "true"]).unwrap();
    let file = repo.0.join("file.txt");
    std::fs::write(&file, "edit").unwrap();
    std::fs::File::options().write(true).open(&file).unwrap()
        .set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_600_000_000)).unwrap();
    let history = read_history(&repo.0).unwrap();
    assert!(history.git_lfs_missing);
    assert_eq!(history.commits[0].subject, "base");
    git(&repo.0, &["config", "--unset", "filter.lfs.required"]).unwrap();
    git(&repo.0, &["config", "--unset", "filter.lfs.process"]).unwrap();
    let history = read_history(&repo.0).unwrap();
    assert!(!history.git_lfs_missing);
    assert!(history.has_changes);
}
