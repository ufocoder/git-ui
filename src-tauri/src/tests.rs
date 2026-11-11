use crate::projects::{load_recent, save_recent, can_initialize_repository, initialize_repository};
use crate::repository_operations::{switch_branch, create_branch_at_commit, create_branch, create_tag, create_tag_at_commit, checkout_commit, reset_branch_to_commit, reset_branch_to_commit_checked, add_remote, set_file_staged, commit_staged, commit_staged_with_options};
use std::path::Path;
static NEXT_TEST_REPO: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(1);

use super::*;
pub(super) struct TempRepo(pub(super) std::path::PathBuf);
impl TempRepo {
    pub(super) fn new() -> Self {
        let p = std::env::temp_dir().join(format!(
            "git-ui-test-{}-{}",
            std::process::id(),
            NEXT_TEST_REPO.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&p).unwrap();
        Self(p)
    }
    pub(super) fn init(&self) {
        git(&self.0, &["init"]).unwrap();
    }
}
impl Drop for TempRepo {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
pub(super) fn commit_file(repo: &TempRepo, contents: &str, message: &str) {
    std::fs::write(repo.0.join("file.txt"), contents).unwrap();
    git(&repo.0, &["add", "file.txt"]).unwrap();
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
            "-m",
            message,
        ],
    )
    .unwrap();
}

pub(super) fn commit_all(repo: &TempRepo, message: &str) {
    git(&repo.0, &["add", "-A"]).unwrap();
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
            "-m",
            message,
        ],
    )
    .unwrap();
}

fn commit_operation_repo() -> TempRepo {
    let repo = TempRepo::new();
    repo.init();
    git(&repo.0, &["config", "user.name", "Test"]).unwrap();
    git(&repo.0, &["config", "user.email", "test@example.com"]).unwrap();
    git(&repo.0, &["config", "commit.gpgsign", "false"]).unwrap();
    commit_file(&repo, "base", "Base");
    repo
}

fn text_merge_conflict() -> (TempRepo, ProjectHistory) {
    let repo = commit_operation_repo();
    let base = read_history(&repo.0).unwrap();
    git(&repo.0, &["switch", "-c", "topic"]).unwrap();
    commit_file(&repo, "topic", "Topic");
    git(&repo.0, &["switch", &base.current_branch]).unwrap();
    commit_file(&repo, "main", "Main");
    let before = read_history(&repo.0).unwrap();
    assert!(git(&repo.0, &["merge", "--no-edit", "topic"]).is_err());
    (repo, before)
}

fn configure_committer(repo: &TempRepo) {
    git(&repo.0, &["config", "user.name", "Test"]).unwrap();
    git(&repo.0, &["config", "user.email", "test@example.com"]).unwrap();
    git(&repo.0, &["config", "commit.gpgsign", "false"]).unwrap();
}

mod commit_operations_tests;
mod conflicts_tests;
mod diffs_tests;
mod history_tests;
mod projects_tests;
mod references_tests;
mod stash_tests;
mod sync_tests;
