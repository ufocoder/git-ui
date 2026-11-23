use crate::{
    ProjectHistory, Projects, git, git_command::git_with_input, locale, project_path, read_history,
    read_worktree_files,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path};
use tauri::{State, WebviewWindow};

#[derive(Deserialize)]
pub struct Target {
    head: String,
    branch: String,
    // Ordered from oldest to newest, as displayed in the confirmation dialog.
    commits: Vec<String>,
    #[serde(default)]
    accept_extension: bool,
}

#[derive(Serialize)]
pub struct Preview {
    count: usize,
    published: bool,
    messages: Vec<String>,
    backup: String,
    extension: Option<String>,
}

struct Plan {
    source_tip: String,
    chain: Vec<String>,
    parents: Vec<String>,
    preview: Preview,
}

fn ensure_target(path: &Path, target: &Target) -> Result<(), String> {
    if target.branch.is_empty()
        || git(path, &["symbolic-ref", "--quiet", "HEAD"])?.trim()
            != format!("refs/heads/{}", target.branch)
        || git(path, &["rev-parse", "--verify", "HEAD"])?.trim() != target.head
    {
        return Err(locale::text("operation.stale-target").into());
    }
    crate::stash::ensure_no_operation(path)?;
    let state_paths = git(
        path,
        &[
            "rev-parse",
            "--git-path",
            "sequencer",
            "--git-path",
            "BISECT_START",
        ],
    )?;
    if state_paths.lines().any(|entry| path.join(entry).exists()) {
        return Err(locale::text("stash.operation-in-progress").into());
    }
    if !read_worktree_files(path)?.is_empty() {
        return Err(locale::text("operation.dirty").into());
    }
    Ok(())
}

fn plan(path: &Path, target: &Target) -> Result<Plan, String> {
    let invalid = || locale::text("rewrite.invalid-range").to_owned();
    let oldest = target.commits.first().ok_or_else(invalid)?;
    crate::commit_diff_args(path, oldest)?;
    ensure_target(path, target)?;
    if git(path, &["rev-parse", "--is-shallow-repository"])?.trim() == "true" {
        return Err(locale::text("rewrite.shallow").into());
    }
    let newest = target.commits.last().ok_or_else(invalid)?;
    crate::commit_diff_args(path, newest)?;
    let source_tip = if git(path, &["merge-base", "--is-ancestor", newest, &target.head]).is_ok() {
        target.head.clone()
    } else if target.commits.len() > 1
        && git(path, &["merge-base", "--is-ancestor", &target.head, newest]).is_ok()
    {
        newest.clone()
    } else {
        return Err(locale::text("rewrite.outside-branch").into());
    };
    let extension = (source_tip != target.head).then(|| source_tip.clone());
    let range = format!("{oldest}..{source_tip}");
    let parents = read_parents(path, oldest)?;
    let squash = target.commits.len() > 1;
    let traversal = if squash {
        "--parents"
    } else {
        "--ancestry-path"
    };
    let rows = git(
        path,
        &[
            "rev-list",
            "--reverse",
            "--topo-order",
            traversal,
            &range,
            "--",
        ],
    )?;
    if squash && parents.len() > 1 {
        return Err(invalid());
    }
    let mut chain = vec![oldest.clone()];
    for row in rows.lines() {
        if squash {
            let fields: Vec<_> = row.split_whitespace().collect();
            if fields.len() != 2 || chain.last().map(String::as_str) != Some(fields[1]) {
                return Err(invalid());
            }
            chain.push(fields[0].into());
        } else {
            chain.push(row.into());
        }
    }
    if chain.last() != Some(&source_tip) || !chain.starts_with(&target.commits) {
        return Err(invalid());
    }
    let published = !git(
        path,
        &[
            "for-each-ref",
            "--count=1",
            "--format=%(refname)",
            "--contains",
            oldest,
            "refs/remotes/",
        ],
    )?
    .trim()
    .is_empty();
    let messages = target
        .commits
        .iter()
        .map(|commit| read_message(path, commit))
        .collect::<Result<_, _>>()?;
    Ok(Plan {
        preview: Preview {
            count: chain.len(),
            published,
            messages,
            backup: format!("refs/git-ui/rewrites/{}", target.head),
            extension,
        },
        source_tip,
        chain,
        parents,
    })
}

fn read_parents(path: &Path, commit: &str) -> Result<Vec<String>, String> {
    let output = git(
        path,
        &[
            "show",
            "-s",
            "--no-show-signature",
            "--format=%P",
            commit,
            "--",
        ],
    )?;
    Ok(output.split_whitespace().map(str::to_owned).collect())
}

fn read_message(path: &Path, commit: &str) -> Result<String, String> {
    git(
        path,
        &[
            "show",
            "-s",
            "--no-show-signature",
            "--format=format:%B",
            commit,
            "--",
        ],
    )
}

fn write_commit(
    path: &Path,
    tree_source: &str,
    author_source: &str,
    parents: &[String],
    message: &str,
) -> Result<String, String> {
    let metadata = git(
        path,
        &[
            "show",
            "-s",
            "--no-show-signature",
            "--format=%an%x00%ae%x00%aI",
            author_source,
            "--",
        ],
    )?;
    let author: Vec<_> = metadata.trim_end_matches('\n').split('\0').collect();
    let [name, email, date] = author.as_slice() else {
        return Err(locale::text("rewrite.invalid-range").into());
    };
    let tree = format!("{tree_source}^{{tree}}");
    let mut args = vec!["commit-tree", &tree];
    for parent in parents {
        args.extend(["-p", parent]);
    }
    git_with_input(
        path,
        &args,
        message,
        &[
            ("GIT_AUTHOR_NAME", name),
            ("GIT_AUTHOR_EMAIL", email),
            ("GIT_AUTHOR_DATE", date),
        ],
    )
    .map(|value| value.trim().to_owned())
}

fn rewrite(
    path: &Path,
    target: &Target,
    message: &str,
    accept_published: bool,
) -> Result<ProjectHistory, String> {
    if message.trim().is_empty() || message.contains('\0') {
        return Err(locale::text("error.commit-message-required").into());
    }
    let plan = plan(path, target)?;
    if plan.preview.published && !accept_published {
        return Err(locale::text("rewrite.published").into());
    }
    if plan.preview.extension.is_some() && !target.accept_extension {
        return Err(locale::text("rewrite.extension-confirm-required").into());
    }
    let oldest = &target.commits[0];
    let newest = target.commits.last().unwrap();
    if target.commits.len() == 1 && message.trim() == plan.preview.messages[0].trim() {
        return read_history(path);
    }
    let combined = write_commit(
        path,
        newest,
        oldest,
        &plan.parents,
        &format!("{}\n", message.trim()),
    )?;
    let mut replacements = HashMap::from([(newest.as_str(), combined)]);
    for commit in &plan.chain[target.commits.len()..] {
        let parents = read_parents(path, commit)?
            .into_iter()
            .map(|parent| replacements.get(parent.as_str()).cloned().unwrap_or(parent))
            .collect::<Vec<_>>();
        let replacement =
            write_commit(path, commit, commit, &parents, &read_message(path, commit)?)?;
        replacements.insert(commit, replacement);
    }
    let rewritten = &replacements[plan.source_tip.as_str()];
    ensure_target(path, target)?;
    if rewritten != &target.head {
        let before = format!("{}^{{tree}}", plan.source_tip);
        let after = format!("{rewritten}^{{tree}}");
        let trees = git(path, &["rev-parse", &before, &after])?;
        let trees: Vec<_> = trees.lines().collect();
        if !matches!(trees.as_slice(), [before, after] if before == after) {
            return Err(locale::text("rewrite.invalid-range").into());
        }
        let transaction = format!(
            "option no-deref\nupdate {} {}\noption no-deref\nupdate refs/heads/{} {} {}\noption no-deref\nupdate refs/git-ui/rewrite-results/{}/{} {}\n",
            plan.preview.backup,
            target.head,
            target.branch,
            rewritten,
            target.head,
            rewritten,
            target.branch,
            target.head,
        );
        update_branch_tree(path, &target.head, rewritten, &transaction)?;
    }
    read_history(path)
}

// Update clean worktrees only when the selected range extends beyond HEAD.
// Keep the branch compare-and-swap and recovery refs in one transaction; if it
// fails, restore the old tree without overwriting intervening local edits.
fn update_branch_tree(
    path: &Path,
    before: &str,
    after: &str,
    transaction: &str,
) -> Result<(), String> {
    let before_tree = git(path, &["rev-parse", &format!("{before}^{{tree}}")])?;
    let after_tree = git(path, &["rev-parse", &format!("{after}^{{tree}}")])?;
    let changed = before_tree != after_tree;
    if changed {
        crate::development_guard::ensure_safe(path)?;
        git(path, &["read-tree", "-u", "-m", before, after])?;
    }
    if let Err(error) = git_with_input(
        path,
        &["update-ref", "-m", "Git UI: rewrite history", "--stdin"],
        transaction,
        &[],
    ) {
        if changed {
            if let Err(rollback) = git(path, &["read-tree", "-u", "-m", after, before]) {
                return Err(format!(
                    "{error}\n{}\n{rollback}",
                    locale::text("rewrite.rollback-failed")
                ));
            }
        }
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub async fn preview_history_rewrite(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    target: Target,
) -> Result<Preview, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        plan(Path::new(&path), &target).map(|plan| plan.preview)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn rewrite_history(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    target: Target,
    message: String,
    accept_published: bool,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        rewrite(Path::new(&path), &target, &message, accept_published)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{TempRepo, commit_all, commit_file};

    fn fixture() -> (TempRepo, Vec<String>, String) {
        let repo = TempRepo::new();
        repo.init();
        for (key, value) in [
            ("user.name", "Test"),
            ("user.email", "test@example.com"),
            ("commit.gpgsign", "false"),
        ] {
            git(&repo.0, &["config", "--local", key, value]).unwrap();
        }
        let commits = ["one", "two", "three"]
            .into_iter()
            .map(|message| {
                commit_file(&repo, message, message);
                git(&repo.0, &["rev-parse", "HEAD"])
                    .unwrap()
                    .trim()
                    .to_owned()
            })
            .collect();
        let branch = git(&repo.0, &["branch", "--show-current"])
            .unwrap()
            .trim()
            .to_owned();
        (repo, commits, branch)
    }

    #[test]
    fn squash_can_extend_branch_with_explicit_approval_and_restore_the_original_tree() {
        let (repo, commits, branch) = fixture();
        git(&repo.0, &["update-ref", "refs/heads/other", &commits[2]]).unwrap();
        git(
            &repo.0,
            &["update-ref", "refs/remotes/origin/main", &commits[2]],
        )
        .unwrap();
        git(&repo.0, &["reset", "--hard", &commits[1]]).unwrap();
        let mut target = Target {
            head: commits[1].clone(),
            branch: branch.clone(),
            commits: commits.clone(),
            accept_extension: false,
        };
        let preview = plan(&repo.0, &target).unwrap().preview;
        assert_eq!(preview.extension.as_deref(), Some(commits[2].as_str()));
        assert!(preview.published);
        assert!(rewrite(&repo.0, &target, "combined", true).is_err());
        assert_eq!(
            git(&repo.0, &["rev-parse", "HEAD"]).unwrap().trim(),
            commits[1]
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "two"
        );
        target.accept_extension = true;
        assert!(rewrite(&repo.0, &target, "combined", false).is_err());
        let result = rewrite(&repo.0, &target, "combined", true).unwrap();
        assert_ne!(result.tip, commits[1]);
        assert_eq!(
            git(&repo.0, &["log", "--format=%s"]).unwrap().trim(),
            "combined"
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "three"
        );
        assert!(!result.has_changes);
        assert_eq!(
            git(&repo.0, &["rev-parse", "refs/heads/other"])
                .unwrap()
                .trim(),
            commits[2]
        );
        assert_eq!(
            git(&repo.0, &["rev-parse", "refs/remotes/origin/main"])
                .unwrap()
                .trim(),
            commits[2]
        );
        assert_eq!(
            git(&repo.0, &["rev-parse", &preview.backup])
                .unwrap()
                .trim(),
            commits[1]
        );
        let restored = restore(&repo.0, result.tip, branch).unwrap();
        assert_eq!(restored.tip, commits[1]);
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "two"
        );
        assert!(!restored.has_changes);
    }

    #[test]
    fn failed_ref_transaction_rolls_back_checked_out_tree() {
        let (repo, commits, branch) = fixture();
        let transaction = format!(
            "option no-deref\nupdate refs/heads/{branch} {} {}\n",
            commits[0], commits[1]
        );
        assert!(update_branch_tree(&repo.0, &commits[2], &commits[0], &transaction).is_err());
        assert_eq!(
            git(&repo.0, &["rev-parse", "HEAD"]).unwrap().trim(),
            commits[2]
        );
        assert_eq!(
            std::fs::read_to_string(repo.0.join("file.txt")).unwrap(),
            "three"
        );
        assert!(crate::read_worktree_files(&repo.0).unwrap().is_empty());
    }

    #[test]
    fn reword_replays_descendants_and_keeps_recovery_ref() {
        let (repo, commits, branch) = fixture();
        let target = Target {
            head: commits[2].clone(),
            branch,
            accept_extension: false,
            commits: vec![commits[1].clone()],
        };
        let preview = plan(&repo.0, &target).unwrap().preview;
        assert_eq!(preview.count, 2);
        assert_eq!(preview.messages[0].trim_end(), "two");
        let tree = git(&repo.0, &["rev-parse", "HEAD^{tree}"]).unwrap();
        let result = rewrite(&repo.0, &target, "new subject\n\nnew body", false).unwrap();
        assert_ne!(result.tip, target.head);
        assert_eq!(git(&repo.0, &["rev-parse", "HEAD^{tree}"]).unwrap(), tree);
        assert_eq!(
            git(&repo.0, &["rev-parse", "HEAD~2"]).unwrap().trim(),
            commits[0]
        );
        assert_eq!(
            git(&repo.0, &["rev-parse", &preview.backup])
                .unwrap()
                .trim(),
            target.head
        );
        assert_eq!(
            read_message(&repo.0, "HEAD^").unwrap().trim_end(),
            "new subject\n\nnew body"
        );
        assert!(!result.has_changes);
        assert!(rewrite(&repo.0, &target, "stale", false).is_err());
    }

    #[test]
    fn restores_only_when_branch_still_has_the_rewritten_tip() {
        let (repo, commits, branch) = fixture();
        let target = Target {
            head: commits[2].clone(),
            branch: branch.clone(),
            accept_extension: false,
            commits: vec![commits[2].clone()],
        };
        let updated = rewrite(&repo.0, &target, "rewritten", false).unwrap();
        let restored = restore(&repo.0, updated.tip.clone(), branch.clone()).unwrap();
        assert_eq!(restored.tip, target.head);
        assert!(!restored.has_changes);
        commit_file(&repo, "new", "new");
        assert!(restore(&repo.0, updated.tip, branch).is_err());
    }

    #[test]
    fn reword_across_merge_preserves_unrelated_parent_and_rejects_squash() {
        let (repo, commits, branch) = fixture();
        git(&repo.0, &["checkout", "-b", "side", &commits[0]]).unwrap();
        std::fs::write(repo.0.join("side.txt"), "side").unwrap();
        commit_all(&repo, "side");
        let side = git(&repo.0, &["rev-parse", "HEAD"])
            .unwrap()
            .trim()
            .to_owned();
        git(&repo.0, &["checkout", &branch]).unwrap();
        git(&repo.0, &["merge", "--no-ff", "-m", "merge", "side"]).unwrap();
        let head = git(&repo.0, &["rev-parse", "HEAD"])
            .unwrap()
            .trim()
            .to_owned();
        let squash = Target {
            head,
            branch,
            accept_extension: false,
            commits: commits[1..].to_vec(),
        };
        assert!(plan(&repo.0, &squash).is_err());
        let reword = Target {
            accept_extension: false,
            commits: vec![commits[1].clone()],
            ..squash
        };
        assert_eq!(plan(&repo.0, &reword).unwrap().preview.count, 3);
        let result = rewrite(&repo.0, &reword, "updated", false).unwrap();
        assert!(!result.has_changes);
        assert_eq!(read_parents(&repo.0, &result.tip).unwrap()[1], side);
        assert_eq!(
            read_message(&repo.0, "HEAD~2").unwrap().trim_end(),
            "updated"
        );
    }

    #[test]
    fn squash_requires_a_clean_contiguous_range_and_publication_confirmation() {
        let (repo, commits, branch) = fixture();
        let invalid = Target {
            head: commits[2].clone(),
            branch: branch.clone(),
            accept_extension: false,
            commits: vec![commits[0].clone(), commits[2].clone()],
        };
        assert!(plan(&repo.0, &invalid).is_err());
        let target = Target {
            commits: commits[..2].to_vec(),
            ..invalid
        };
        git(
            &repo.0,
            &["update-ref", "refs/remotes/origin/main", &commits[1]],
        )
        .unwrap();
        assert!(plan(&repo.0, &target).unwrap().preview.published);
        assert!(rewrite(&repo.0, &target, "combined", false).is_err());
        std::fs::write(repo.0.join("file.txt"), "dirty").unwrap();
        assert!(rewrite(&repo.0, &target, "combined", true).is_err());
        git(&repo.0, &["restore", "file.txt"]).unwrap();
        assert_eq!(
            git(&repo.0, &["rev-parse", "HEAD"]).unwrap().trim(),
            target.head
        );
        let result = rewrite(&repo.0, &target, "combined", true).unwrap();
        assert!(!result.has_changes);
        assert_eq!(
            git(&repo.0, &["log", "--format=%s"]).unwrap(),
            "three\ncombined\n"
        );
        assert_eq!(git(&repo.0, &["show", "HEAD^:file.txt"]).unwrap(), "two");
        assert_eq!(
            git(&repo.0, &["rev-parse", "refs/remotes/origin/main"])
                .unwrap()
                .trim(),
            commits[1]
        );
    }
}

pub(super) fn original_head(path: &Path, head: &str, branch: &str) -> Result<String, String> {
    crate::commit_diff_args(path, head)?;
    let reference = format!("refs/git-ui/rewrite-results/{head}/{branch}");
    git(path, &["rev-parse", "--verify", &reference])
        .map(|value| value.trim().to_owned())
        .map_err(|_| locale::text("operation.stale-target").into())
}

fn restore(path: &Path, head: String, branch: String) -> Result<ProjectHistory, String> {
    let target = Target {
        head,
        branch,
        commits: Vec::new(),
        accept_extension: false,
    };
    ensure_target(path, &target)?;
    let old = original_head(path, &target.head, &target.branch)?;
    let transaction = format!(
        "option no-deref\nupdate refs/heads/{} {} {}\n",
        target.branch, old, target.head
    );
    update_branch_tree(path, &target.head, &old, &transaction)?;
    read_history(path)
}

#[tauri::command]
pub async fn restore_rewritten_history(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    head: String,
    branch: String,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || restore(Path::new(&path), head, branch))
        .await
        .map_err(|error| error.to_string())?
}
