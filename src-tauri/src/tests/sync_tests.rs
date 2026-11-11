use super::*;

#[test]
fn pull_and_push_sync_with_local_remote() {
    let remote = TempRepo::new();
    git(&remote.0, &["init", "--bare"]).unwrap();
    let first = TempRepo::new();
    first.init();
    commit_file(&first, "base", "Base");
    let branch = read_history(&first.0).unwrap().current_branch;
    git(
        &first.0,
        &["remote", "add", "origin", remote.0.to_str().unwrap()],
    )
    .unwrap();
    git(&first.0, &["push", "-u", "origin", &branch]).unwrap();
    let second = TempRepo::new();
    git(
        &second.0,
        &[
            "clone",
            "--branch",
            &branch,
            remote.0.to_str().unwrap(),
            ".",
        ],
    )
    .unwrap();
    commit_file(&first, "updated", "Pushed commit");
    let pushed = sync_repository(&first.0, "push", tracking::PullMode::Configured).unwrap();
    let pulled = sync_repository(&second.0, "pull", tracking::PullMode::Configured).unwrap();
    assert_eq!(pulled.tip, pushed.tip);
    assert_eq!(
        std::fs::read_to_string(second.0.join("file.txt")).unwrap(),
        "updated"
    );
    commit_file(&first, "first change", "Remote side");
    sync_repository(&first.0, "push", tracking::PullMode::Configured).unwrap();
    commit_file(&second, "second change", "Local side");
    let before = read_history(&second.0).unwrap().tip;
    assert!(sync_repository(&second.0, "pull", tracking::PullMode::FastForwardOnly).is_err());
    assert!(sync_repository(&second.0, "push", tracking::PullMode::Configured).is_err());
    assert_eq!(read_history(&second.0).unwrap().tip, before);
}

#[test]
fn publishes_selected_branch_to_selected_remote_and_pushes_only_its_upstream() {
    let origin = TempRepo::new();
    git(&origin.0, &["init", "--bare"]).unwrap();
    let backup = TempRepo::new();
    git(&backup.0, &["init", "--bare"]).unwrap();
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "base", "Base");
    git(
        &repo.0,
        &["remote", "add", "origin", origin.0.to_str().unwrap()],
    )
    .unwrap();
    git(
        &repo.0,
        &["remote", "add", "backup", backup.0.to_str().unwrap()],
    )
    .unwrap();
    let before = read_history(&repo.0).unwrap();
    std::fs::write(repo.0.join("file.txt"), "staged change").unwrap();
    git(&repo.0, &["add", "file.txt"]).unwrap();
    std::fs::write(repo.0.join("file.txt"), "unstaged change").unwrap();
    let index = git(&repo.0, &["diff", "--cached"]).unwrap();
    let published =
        tracking::publish(&repo.0, &before.current_branch, "backup", "review/feature").unwrap();
    assert_eq!(published.tip, before.tip);
    assert_eq!(published.current_branch, before.current_branch);
    assert_eq!(
        published.sync.upstream.as_deref(),
        Some("backup/review/feature")
    );
    assert_eq!(published.sync.ahead, 0);
    assert_eq!(published.sync.behind, 0);
    assert_eq!(
        git(&backup.0, &["rev-parse", "refs/heads/review/feature"])
            .unwrap()
            .trim(),
        before.tip
    );
    assert!(
        git(
            &origin.0,
            &["for-each-ref", "--format=%(refname)", "refs/heads/"]
        )
        .unwrap()
        .is_empty()
    );
    assert_eq!(git(&repo.0, &["diff", "--cached"]).unwrap(), index);
    assert_eq!(
        std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
        "unstaged change"
    );
    git(&backup.0, &["update-ref", "refs/heads/other", &before.tip]).unwrap();
    commit_file(&repo, "next commit", "Next");
    let next = read_history(&repo.0).unwrap().tip;
    git(&repo.0, &["branch", "other", &next]).unwrap();
    git(&repo.0, &["config", "push.default", "matching"]).unwrap();
    git(
        &repo.0,
        &[
            "config",
            "remote.backup.push",
            "+refs/heads/other:refs/heads/other",
        ],
    )
    .unwrap();
    sync_repository(&repo.0, "push", tracking::PullMode::Configured).unwrap();
    assert_eq!(
        git(&backup.0, &["rev-parse", "refs/heads/review/feature"])
            .unwrap()
            .trim(),
        next
    );
    assert_eq!(
        git(&backup.0, &["rev-parse", "refs/heads/other"])
            .unwrap()
            .trim(),
        before.tip
    );
    let source = TempRepo::new();
    git(
        &source.0,
        &[
            "clone",
            "--branch",
            "review/feature",
            backup.0.to_str().unwrap(),
            ".",
        ],
    )
    .unwrap();
    commit_file(&source, "server commit", "Server");
    git(&source.0, &["push"]).unwrap();
    let server_tip = read_history(&source.0).unwrap().tip;
    commit_file(&repo, "local divergence", "Local");
    let local_tip = read_history(&repo.0).unwrap().tip;
    assert!(
        tracking::publish(&repo.0, &before.current_branch, "backup", "review/feature").is_err()
    );
    assert_eq!(
        git(&backup.0, &["rev-parse", "refs/heads/review/feature"])
            .unwrap()
            .trim(),
        server_tip
    );
    assert_eq!(read_history(&repo.0).unwrap().tip, local_tip);
}

#[test]
fn sets_upstream_without_changing_files_and_pulls_from_differently_named_branch() {
    let remote = TempRepo::new();
    git(&remote.0, &["init", "--bare"]).unwrap();
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "base", "Base");
    git(
        &repo.0,
        &["remote", "add", "origin", remote.0.to_str().unwrap()],
    )
    .unwrap();
    git(&repo.0, &["push", "origin", "HEAD:refs/heads/trunk"]).unwrap();
    git(&repo.0, &["fetch", "origin"]).unwrap();
    let before = read_history(&repo.0).unwrap();
    std::fs::write(repo.0.join("untracked.md"), "keep").unwrap();
    let configured =
        tracking::set_upstream(&repo.0, &before.current_branch, "origin", "trunk").unwrap();
    assert_eq!(configured.tip, before.tip);
    assert_eq!(configured.current_branch, before.current_branch);
    assert_eq!(configured.sync.upstream.as_deref(), Some("origin/trunk"));
    assert_eq!(
        std::fs::read_to_string(repo.0.join("untracked.md")).unwrap(),
        "keep"
    );
    assert!(tracking::set_upstream(&repo.0, "stale-branch", "origin", "trunk").is_err());
    assert!(
        tracking::set_upstream(&repo.0, &before.current_branch, "origin", "missing").is_err()
    );
    assert!(tracking::publish(&repo.0, &before.current_branch, "missing", "trunk").is_err());
    assert!(tracking::publish(&repo.0, &before.current_branch, "origin", "--bad").is_err());
    let source = TempRepo::new();
    git(
        &source.0,
        &[
            "clone",
            "--branch",
            "trunk",
            remote.0.to_str().unwrap(),
            ".",
        ],
    )
    .unwrap();
    commit_file(&source, "new remote content", "Remote update");
    git(&source.0, &["push"]).unwrap();
    let pulled = sync_repository(&repo.0, "pull", tracking::PullMode::Configured).unwrap();
    assert_eq!(pulled.current_branch, before.current_branch);
    assert_eq!(
        std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
        "new remote content"
    );
    assert_eq!(
        std::fs::read_to_string(repo.0.join("untracked.md")).unwrap(),
        "keep"
    );
    let log = terminal_log::latest(&repo.0).unwrap().unwrap();
    assert_eq!(log.command, "git pull");
    git(&repo.0, &["switch", "--detach", &pulled.tip]).unwrap();
    assert!(tracking::publish(&repo.0, &before.current_branch, "origin", "trunk").is_err());
    let empty = TempRepo::new();
    empty.init();
    assert!(tracking::publish(&empty.0, "main", "origin", "trunk").is_err());
}

#[test]
fn fetch_reports_divergence_and_preserves_head_index_and_worktree() {
    let remote = TempRepo::new();
    git(&remote.0, &["init", "--bare"]).unwrap();
    let source = TempRepo::new();
    source.init();
    commit_file(&source, "base", "Base");
    let initial = read_history(&source.0).unwrap();
    assert!(initial.sync.upstream.is_none());
    git(
        &source.0,
        &["remote", "add", "origin", remote.0.to_str().unwrap()],
    )
    .unwrap();
    git(
        &source.0,
        &["push", "-u", "origin", &initial.current_branch],
    )
    .unwrap();
    let local = TempRepo::new();
    git(
        &local.0,
        &[
            "clone",
            "--branch",
            &initial.current_branch,
            remote.0.to_str().unwrap(),
            ".",
        ],
    )
    .unwrap();
    assert_eq!(read_history(&local.0).unwrap().sync.ahead, 0);
    assert_eq!(read_history(&local.0).unwrap().sync.behind, 0);
    commit_file(&local, "local commit", "Outgoing commit");
    for n in 0..PAGE_SIZE + 3 {
        git(
            &source.0,
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
                &format!("Incoming {n}"),
            ],
        )
        .unwrap();
    }
    git(&source.0, &["push"]).unwrap();
    std::fs::write(local.0.join("file.txt"), "staged local change").unwrap();
    git(&local.0, &["add", "file.txt"]).unwrap();
    std::fs::write(local.0.join("file.txt"), "unstaged local change").unwrap();
    std::fs::write(local.0.join("untracked.txt"), "keep").unwrap();
    let before = read_history(&local.0).unwrap();
    let index = git(&local.0, &["diff", "--cached"]).unwrap();
    let fetched = sync_repository(&local.0, "fetch", tracking::PullMode::Configured).unwrap();
    assert_eq!(fetched.tip, before.tip);
    assert_eq!(fetched.current_branch, before.current_branch);
    assert_eq!(git(&local.0, &["diff", "--cached"]).unwrap(), index);
    assert_eq!(
        std::fs::read_to_string(local.0.join("file.txt")).unwrap(),
        "unstaged local change"
    );
    assert_eq!(
        std::fs::read_to_string(local.0.join("untracked.txt")).unwrap(),
        "keep"
    );
    assert_eq!(fetched.sync.ahead, 1);
    assert_eq!(fetched.sync.behind, PAGE_SIZE + 3);
    assert_eq!(
        fetched.sync.upstream,
        Some(format!("origin/{}", initial.current_branch))
    );
    let remote_tip = fetched.sync.remote_tip.clone().unwrap();
    let mut tree_commits = fetched.commits.clone();
    let mut more = fetched.has_more;
    while more {
        let page = read_commit_page(&local.0, &fetched.tip, tree_commits.len()).unwrap();
        more = page.has_more;
        tree_commits.extend(page.commits);
    }
    assert!(tree_commits.iter().any(|commit| commit.hash == remote_tip));
    assert!(tree_commits.iter().any(|commit| commit.hash == fetched.tip));
    assert_eq!(tree_commits.iter().map(|commit| &commit.hash).collect::<std::collections::HashSet<_>>().len(), tree_commits.len());
    let remote_search = history_search::page(
        &local.0, &fetched.tip, Some(&remote_tip), "all",
        &history_search::HistoryFilter { sha: remote_tip[..8].into(), ..Default::default() }, 0,
    ).unwrap();
    assert_eq!(remote_search.commits.len(), 1);
    assert_eq!(remote_search.commits[0].hash, remote_tip);
    let first = sync_status::page(&local.0, &fetched.tip, &remote_tip, "incoming", 0).unwrap();
    assert_eq!(first.commits.len(), PAGE_SIZE);
    assert!(first.has_more);
    assert_eq!(
        first.commits[0].subject,
        format!("Incoming {}", PAGE_SIZE + 2)
    );
    let outgoing =
        sync_status::page(&local.0, &fetched.tip, &remote_tip, "outgoing", 0).unwrap();
    assert_eq!(outgoing.commits.len(), 1);
    assert_eq!(outgoing.commits[0].subject, "Outgoing commit");
    let filter = history_search::HistoryFilter {
        text: "Incoming 1".into(),
        ..Default::default()
    };
    let incoming_search = history_search::page(
        &local.0,
        &fetched.tip,
        Some(&remote_tip),
        "incoming",
        &filter,
        0,
    )
    .unwrap();
    assert_eq!(incoming_search.commits.len(), 11);
    assert!(
        history_search::page(
            &local.0,
            &fetched.tip,
            Some(&remote_tip),
            "outgoing",
            &filter,
            0
        )
        .unwrap()
        .commits
        .is_empty()
    );

    let second =
        sync_status::page(&local.0, &fetched.tip, &remote_tip, "incoming", PAGE_SIZE).unwrap();
    assert_eq!(second.commits.len(), 3);
    assert!(!second.has_more);
    assert!(sync_status::page(&local.0, "--all", &remote_tip, "incoming", 0).is_err());
    assert!(sync_status::page(&local.0, &fetched.tip, &remote_tip, "invalid", 0).is_err());
    let log = terminal_log::latest(&local.0).unwrap().unwrap();
    assert_eq!(log.command, "git fetch --all --prune");
    assert_eq!(log.status, "success");
    git(&local.0, &["switch", "--detach", &fetched.tip]).unwrap();
    let detached = sync_repository(&local.0, "fetch", tracking::PullMode::Configured).unwrap();
    assert!(detached.current_branch.is_empty());
    assert!(detached.sync.upstream.is_none());
    let timestamp = detached.last_fetch.expect("successful fetch records its time");
    assert_eq!(read_history(&local.0).unwrap().last_fetch, Some(timestamp));
    git(&local.0, &["remote", "set-url", "origin", "/git-ui-missing-remote"]).unwrap();
    assert!(sync_repository(&local.0, "fetch", tracking::PullMode::Configured).is_err());
    assert_eq!(read_history(&local.0).unwrap().last_fetch, Some(timestamp));
}

#[test]
fn sync_rejects_repository_without_remote() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "base", "Base");
    assert!(
        sync_repository(&repo.0, "pull", tracking::PullMode::Configured)
            .unwrap_err()
            .contains("remote")
    );
    assert!(sync_repository(&repo.0, "push", tracking::PullMode::Configured).is_err());
    assert!(sync_repository(&repo.0, "fetch", tracking::PullMode::Configured).is_err());
}

#[test]
fn branch_comparisons_use_upstream_or_head() {
    let repo = TempRepo::new();
    repo.init();
    commit_file(&repo, "base", "Base");
    let main = read_history(&repo.0).unwrap().current_branch;
    let base = read_history(&repo.0).unwrap().tip;
    git(
        &repo.0,
        &["remote", "add", "origin", "/unused-local-remote"],
    )
    .unwrap();
    git(&repo.0, &["update-ref", "refs/remotes/origin/main", &base]).unwrap();
    git(&repo.0, &["branch", "--set-upstream-to=origin/main", &main]).unwrap();
    commit_file(&repo, "local", "Local");
    let history = read_history(&repo.0).unwrap();
    let comparisons = read_branch_comparisons(&repo.0, &history.tip).unwrap();
    assert_eq!(comparisons[&main].base, "origin/main");
    assert_eq!(
        (comparisons[&main].ahead, comparisons[&main].behind),
        (1, 0)
    );
    git(&repo.0, &["switch", "-c", "other", &base]).unwrap();
    commit_file(&repo, "remote", "Remote");
    git(&repo.0, &["update-ref", "refs/remotes/origin/main", "HEAD"]).unwrap();
    git(&repo.0, &["switch", &main]).unwrap();
    let history = read_history(&repo.0).unwrap();
    let comparisons = read_branch_comparisons(&repo.0, &history.tip).unwrap();
    assert_eq!(
        (comparisons[&main].ahead, comparisons[&main].behind),
        (1, 1)
    );
    assert_eq!(comparisons["other"].base, "HEAD");
    assert_eq!(
        (comparisons["other"].ahead, comparisons["other"].behind),
        (1, 1)
    );
}
