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
}

#[derive(Serialize)]
pub struct Preview {
    count: usize,
    published: bool,
    messages: Vec<String>,
    backup: String,
}

struct Plan {
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
    let range = format!("{oldest}..{}", target.head);
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
    if chain.last() != Some(&target.head) || !chain.starts_with(&target.commits) {
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
        },
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
    let rewritten = &replacements[target.head.as_str()];
    ensure_target(path, target)?;
    if rewritten != &target.head {
        let before = format!("{}^{{tree}}", target.head);
        let after = format!("{rewritten}^{{tree}}");
        let trees = git(path, &["rev-parse", &before, &after])?;
        let trees: Vec<_> = trees.lines().collect();
        if !matches!(trees.as_slice(), [before, after] if before == after) {
            return Err(locale::text("rewrite.invalid-range").into());
        }
        let transaction = format!(
            "option no-deref\nupdate {} {}\noption no-deref\nupdate refs/heads/{} {} {}\n",
            plan.preview.backup, target.head, target.branch, rewritten, target.head,
        );
        git_with_input(
            path,
            &["update-ref", "-m", "Git UI: rewrite history", "--stdin"],
            &transaction,
            &[],
        )?;
    }
    read_history(path)
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
    fn reword_replays_descendants_and_keeps_recovery_ref() {
        let (repo, commits, branch) = fixture();
        let target = Target {
            head: commits[2].clone(),
            branch,
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
            commits: commits[1..].to_vec(),
        };
        assert!(plan(&repo.0, &squash).is_err());
        let reword = Target {
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
