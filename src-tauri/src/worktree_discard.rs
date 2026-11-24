use crate::{
    diffs::{CommitFile, read_worktree_files},
    git_command::{git, git_with_input},
    history::{ProjectHistory, read_history},
    locale,
    projects::{Projects, project_path},
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, path::Path};
use tauri::{State, WebviewWindow};

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct DiscardTarget {
    head: String,
    branch: String,
    paths: Vec<String>,
    token: String,
}
#[derive(Serialize)]
pub struct DiscardPreview {
    target: DiscardTarget,
    files: Vec<CommitFile>,
}
#[derive(Serialize)]
pub struct DiscardResult {
    history: ProjectHistory,
    backup: String,
    count: usize,
}

fn preview(root: &Path, requested: &[String]) -> Result<DiscardPreview, String> {
    crate::stash::ensure_no_operation(root)?;
    if requested.is_empty() {
        return Err(locale::text("discard.select-files").into());
    }
    for path in requested {
        crate::file_actions::target(root, path)?;
    }
    let head = git(root, &["rev-parse", "--verify", "HEAD"])?
        .trim()
        .to_owned();
    let branch = git(root, &["branch", "--show-current"])?.trim().to_owned();
    let all = read_worktree_files(root)?;
    if all.iter().any(|file| file.status == "U") {
        return Err(locale::text("file-action.operation-in-progress").into());
    }
    let mut files: Vec<_> = all
        .into_iter()
        .filter(|file| {
            requested
                .iter()
                .any(|path| file.path == *path || file.path.starts_with(&format!("{path}/")))
        })
        .collect();
    files.sort_by(|left, right| left.path.cmp(&right.path));
    if files.is_empty() {
        return Err(locale::text("discard.no-changes").into());
    }
    let mut affected = BTreeSet::new();
    for file in &files {
        affected.insert(file.path.clone());
        if let Some(old) = &file.old_path {
            affected.insert(old.clone());
        }
    }
    let index = git(root, &["ls-files", "--stage", "-z"])?;
    // Stash does not reset changes inside submodules, so never claim it did.
    if index.split_terminator('\0').any(|entry| {
        entry.starts_with("160000 ")
            && entry
                .split_once('\t')
                .is_some_and(|(_, path)| affected.contains(path))
    }) {
        return Err(locale::text("discard.unsupported-path").into());
    }
    let mut manifest = format!(
        "{head}\0{branch}\0{index}\0{}",
        serde_json::to_string(&files).map_err(|error| error.to_string())?
    );
    let mut inputs = String::new();
    for path in &affected {
        let full = crate::file_actions::target(root, path)?;
        manifest.push_str(&format!("\0{path}\0"));
        match std::fs::symlink_metadata(&full) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                manifest.push_str(
                    &std::fs::read_link(full)
                        .map_err(|error| error.to_string())?
                        .to_string_lossy(),
                );
            }
            Ok(metadata) if metadata.is_file() => {
                manifest.push_str(&format!("{:?}", metadata.permissions()));
                inputs.push_str(&quoted_path(path));
                inputs.push('\n');
            }
            Ok(_) => return Err(locale::text("discard.unsupported-path").into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                manifest.push_str("missing")
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    if !inputs.is_empty() {
        manifest.push_str(&git_with_input(
            root,
            &["hash-object", "--no-filters", "--stdin-paths"],
            &inputs,
            &[],
        )?);
    }
    let token = git_with_input(root, &["hash-object", "--stdin"], &manifest, &[])?
        .trim()
        .to_owned();
    Ok(DiscardPreview {
        target: DiscardTarget {
            head,
            branch,
            paths: files.iter().map(|file| file.path.clone()).collect(),
            token,
        },
        files,
    })
}

// hash-object --stdin-paths uses Git C quoting, including octal UTF-8 bytes.
fn quoted_path(path: &str) -> String {
    let mut quoted = String::from("\"");
    for byte in path.bytes() {
        match byte {
            b'"' | b'\\' => {
                quoted.push('\\');
                quoted.push(char::from(byte));
            }
            32..=126 => quoted.push(char::from(byte)),
            _ => quoted.push_str(&format!("\\{byte:03o}")),
        }
    }
    quoted.push('"');
    quoted
}

fn pathspecs(paths: &BTreeSet<String>) -> String {
    paths
        .iter()
        .map(|path| format!(":(literal){path}\0"))
        .collect()
}

fn snapshot_commit(
    root: &Path,
    tree: &str,
    parents: &[&str],
    message: &str,
) -> Result<String, String> {
    let mut args = vec![
        "-c",
        "user.name=Git UI",
        "-c",
        "user.email=git-ui@localhost",
        "commit-tree",
        tree,
    ];
    for parent in parents {
        args.extend(["-p", parent]);
    }
    Ok(git_with_input(root, &args, message, &[])?.trim().to_owned())
}

struct TemporaryIndex(std::path::PathBuf);
impl TemporaryIndex {
    fn new() -> Result<Self, String> {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        loop {
            let id = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let path =
                std::env::temp_dir().join(format!("git-ui-discard-{}-{id}", std::process::id()));
            match std::fs::create_dir(&path) {
                Ok(()) => return Ok(Self(path)),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error.to_string()),
            }
        }
    }
}
impl Drop for TemporaryIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

struct DiscardPaths {
    tracked: BTreeSet<String>,
    untracked: BTreeSet<String>,
}
impl DiscardPaths {
    fn read(root: &Path, files: &[CommitFile]) -> Result<Self, String> {
        let mut paths = BTreeSet::new();
        for file in files {
            paths.insert(file.path.clone());
            if let Some(old) = &file.old_path {
                paths.insert(old.clone());
            }
        }
        let untracked: BTreeSet<_> =
            git(root, &["ls-files", "--others", "--exclude-standard", "-z"])?
                .split_terminator('\0')
                .map(str::to_owned)
                .filter(|path| paths.contains(path))
                .collect();
        let tracked: BTreeSet<_> = paths.difference(&untracked).cloned().collect();
        Ok(Self { tracked, untracked })
    }
}

fn save_backup(
    root: &Path,
    target: &DiscardTarget,
    paths: &DiscardPaths,
    count: usize,
) -> Result<String, String> {
    let DiscardPaths { tracked, untracked } = paths;
    let message = locale::format("discard.backup-message", &[("count", count.to_string())]);
    // Build a scoped stash without changing the real index or worktree. Git's
    // path-limited stash push fails for staged deletions and renamed old paths.
    let temporary = TemporaryIndex::new()?;
    let index_path = temporary.0.join("index").to_string_lossy().into_owned();
    let env = [("GIT_INDEX_FILE", index_path.as_str())];
    let run = |args: &[&str], input: &str| git_with_input(root, args, input, &env);
    let actual_index = git(root, &["write-tree"])?.trim().to_owned();
    run(&["read-tree", &target.head], "")?;
    if !tracked.is_empty() {
        run(
            &[
                "restore",
                "--source",
                &actual_index,
                "--staged",
                "--pathspec-from-file=-",
                "--pathspec-file-nul",
            ],
            &pathspecs(&tracked),
        )?;
    }
    let index_tree = run(&["write-tree"], "")?.trim().to_owned();
    let index_commit = snapshot_commit(root, &index_tree, &[&target.head], &message)?;
    run(&["read-tree", &target.head], "")?;
    if !tracked.is_empty() {
        run(
            &["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"],
            &pathspecs(&tracked),
        )?;
    }
    let worktree_tree = run(&["write-tree"], "")?.trim().to_owned();
    let untracked_commit = if untracked.is_empty() {
        None
    } else {
        run(&["read-tree", "--empty"], "")?;
        run(
            &["add", "--pathspec-from-file=-", "--pathspec-file-nul"],
            &pathspecs(&untracked),
        )?;
        let tree = run(&["write-tree"], "")?;
        Some(snapshot_commit(root, tree.trim(), &[], &message)?)
    };
    let mut parents = vec![target.head.as_str(), index_commit.as_str()];
    if let Some(commit) = &untracked_commit {
        parents.push(commit);
    }
    let backup = snapshot_commit(root, &worktree_tree, &parents, &message)?;
    // Publish the recovery copy before touching any selected path.
    git(root, &["stash", "store", "--message", &message, &backup])?;
    Ok(backup)
}

fn restore_selected(
    root: &Path,
    target: &DiscardTarget,
    paths: &DiscardPaths,
) -> Result<(), String> {
    let DiscardPaths { tracked, untracked } = paths;
    if !tracked.is_empty() {
        git_with_input(
            root,
            &[
                "restore",
                "--source",
                &target.head,
                "--staged",
                "--worktree",
                "--pathspec-from-file=-",
                "--pathspec-file-nul",
            ],
            &pathspecs(&tracked),
            &[],
        )?;
    }
    let untracked: Vec<_> = untracked
        .iter()
        .map(|path| format!(":(literal){path}"))
        .collect();
    for batch in untracked.chunks(100) {
        let mut args = vec!["clean", "-f", "--"];
        args.extend(batch.iter().map(String::as_str));
        git(root, &args)?;
    }
    Ok(())
}

fn discard(root: &Path, target: &DiscardTarget, confirmed: bool) -> Result<DiscardResult, String> {
    if !confirmed {
        return Err(locale::text("discard.confirm-required").into());
    }
    crate::development_guard::ensure_safe(root)?;
    let current = preview(root, &target.paths)?;
    if current.target != *target {
        return Err(locale::text("discard.stale").into());
    }
    let paths = DiscardPaths::read(root, &current.files)?;
    let backup = save_backup(root, target, &paths, current.files.len())?;
    if preview(root, &target.paths)?.target != *target {
        return Err(locale::text("discard.stale").into());
    }
    restore_selected(root, target, &paths)?;
    Ok(DiscardResult {
        history: read_history(root)?,
        backup,
        count: current.files.len(),
    })
}

#[tauri::command]
pub async fn preview_discard_changes(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    paths: Vec<String>,
) -> Result<DiscardPreview, String> {
    let root = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || preview(Path::new(&root), &paths))
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
pub async fn discard_worktree_changes(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    target: DiscardTarget,
    confirmed: bool,
) -> Result<DiscardResult, String> {
    let root = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || discard(Path::new(&root), &target, confirmed))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{TempRepo, commit_all};

    fn repo() -> TempRepo {
        let repo = TempRepo::new();
        repo.init();
        git(&repo.0, &["config", "user.name", "Test"]).unwrap();
        git(&repo.0, &["config", "user.email", "test@example.com"]).unwrap();
        for path in ["selected.txt", "other.txt"] {
            std::fs::write(repo.0.join(path), "base\n").unwrap();
        }
        commit_all(&repo, "base");
        repo
    }
    fn write(repo: &TempRepo, path: &str, text: &str) {
        std::fs::write(repo.0.join(path), text).unwrap();
    }
    fn content(repo: &TempRepo, path: &str) -> String {
        std::fs::read_to_string(repo.0.join(path)).unwrap()
    }
    fn plan(repo: &TempRepo, paths: &[&str]) -> DiscardPreview {
        preview(
            &repo.0,
            &paths.iter().map(|p| p.to_string()).collect::<Vec<_>>(),
        )
        .unwrap()
    }

    #[test]
    fn selected_partial_stage_is_restorable_and_other_changes_survive() {
        let repo = repo();
        write(&repo, "selected.txt", "staged\n");
        git(&repo.0, &["add", "selected.txt"]).unwrap();
        write(&repo, "selected.txt", "working\n");
        write(&repo, "other.txt", "other staged\n");
        git(&repo.0, &["add", "other.txt"]).unwrap();
        write(&repo, "other.txt", "other working\n");
        let before_head = git(&repo.0, &["rev-parse", "HEAD"]).unwrap();
        let result = discard(&repo.0, &plan(&repo, &["selected.txt"]).target, true).unwrap();
        assert_eq!(content(&repo, "selected.txt"), "base\n");
        assert_eq!(git(&repo.0, &["show", ":selected.txt"]).unwrap(), "base\n");
        assert_eq!(content(&repo, "other.txt"), "other working\n");
        assert_eq!(
            git(&repo.0, &["show", ":other.txt"]).unwrap(),
            "other staged\n"
        );
        assert_eq!(git(&repo.0, &["rev-parse", "HEAD"]).unwrap(), before_head);
        assert_eq!(
            git(
                &repo.0,
                &[
                    "diff",
                    &format!("{}^1", result.backup),
                    &result.backup,
                    "--name-only"
                ]
            )
            .unwrap()
            .trim(),
            "selected.txt"
        );
        // Git applies stashes onto a clean index; set the unrelated edits aside.
        git(&repo.0, &["stash", "push", "--", "other.txt"]).unwrap();
        git(&repo.0, &["stash", "apply", "--index", &result.backup]).unwrap();
        assert_eq!(content(&repo, "selected.txt"), "working\n");
        assert_eq!(
            git(&repo.0, &["show", ":selected.txt"]).unwrap(),
            "staged\n"
        );
    }

    #[test]
    fn new_files_and_literal_names_are_saved_before_removal() {
        let repo = repo();
        let paths = [
            "new [1].txt",
            "中文\nfile.txt",
            ":(glob)*.txt",
            "control\u{1}file.txt",
        ];
        for path in paths {
            write(&repo, path, "saved new content\n");
        }
        write(&repo, "other.txt", "untouched\n");
        let result = discard(&repo.0, &plan(&repo, &paths).target, true).unwrap();
        for path in paths {
            assert!(!repo.0.join(path).exists());
            assert_eq!(
                git(&repo.0, &["show", &format!("{}^3:{path}", result.backup)]).unwrap(),
                "saved new content\n"
            );
        }
        assert_eq!(content(&repo, "other.txt"), "untouched\n");
    }

    #[test]
    fn staged_additions_and_deletions_round_trip() {
        let repo = repo();
        git(&repo.0, &["rm", "selected.txt"]).unwrap();
        write(&repo, "added.txt", "added staged\n");
        git(&repo.0, &["add", "added.txt"]).unwrap();
        write(&repo, "added.txt", "added working\n");
        let result = discard(
            &repo.0,
            &plan(&repo, &["selected.txt", "added.txt"]).target,
            true,
        )
        .unwrap();
        assert_eq!(content(&repo, "selected.txt"), "base\n");
        assert!(!repo.0.join("added.txt").exists());
        git(&repo.0, &["stash", "apply", "--index", &result.backup]).unwrap();
        assert!(!repo.0.join("selected.txt").exists());
        assert_eq!(content(&repo, "added.txt"), "added working\n");
        assert_eq!(
            git(&repo.0, &["show", ":added.txt"]).unwrap(),
            "added staged\n"
        );
    }

    #[test]
    fn folder_selection_respects_boundaries_and_ignored_files() {
        let repo = repo();
        std::fs::create_dir(repo.0.join("folder")).unwrap();
        write(&repo, "folder/a.txt", "base\n");
        write(&repo, "folder-other.txt", "base\n");
        write(&repo, ".gitignore", "ignored.txt\n");
        commit_all(&repo, "folder");
        write(&repo, "folder/a.txt", "changed\n");
        write(&repo, "folder/new.txt", "new\n");
        write(&repo, "folder/ignored.txt", "ignored\n");
        write(&repo, "folder-other.txt", "keep\n");
        let result = discard(&repo.0, &plan(&repo, &["folder"]).target, true).unwrap();
        assert_eq!(result.count, 2);
        assert_eq!(content(&repo, "folder/a.txt"), "base\n");
        assert!(!repo.0.join("folder/new.txt").exists());
        assert_eq!(content(&repo, "folder/ignored.txt"), "ignored\n");
        assert_eq!(content(&repo, "folder-other.txt"), "keep\n");
        git(&repo.0, &["stash", "apply", "--index", &result.backup]).unwrap();
        assert_eq!(content(&repo, "folder/new.txt"), "new\n");
        assert_eq!(content(&repo, "folder/a.txt"), "changed\n");
    }

    #[test]
    fn staged_rename_is_reverted_with_both_paths_in_backup() {
        let repo = repo();
        git(&repo.0, &["mv", "selected.txt", "renamed.txt"]).unwrap();
        write(&repo, "renamed.txt", "changed\n");
        let result = discard(&repo.0, &plan(&repo, &["renamed.txt"]).target, true).unwrap();
        assert_eq!(content(&repo, "selected.txt"), "base\n");
        assert!(!repo.0.join("renamed.txt").exists());
        git(&repo.0, &["stash", "apply", "--index", &result.backup]).unwrap();
        assert!(!repo.0.join("selected.txt").exists());
        assert_eq!(content(&repo, "renamed.txt"), "changed\n");
    }

    #[test]
    fn stale_or_unconfirmed_selection_does_not_mutate_repository() {
        let repo = repo();
        write(&repo, "selected.txt", "first\n");
        let target = plan(&repo, &["selected.txt"]).target;
        assert!(discard(&repo.0, &target, false).is_err());
        write(&repo, "selected.txt", "second\n");
        assert!(discard(&repo.0, &target, true).is_err());
        let target = plan(&repo, &["selected.txt"]).target;
        write(&repo, "other.txt", "new index\n");
        git(&repo.0, &["add", "other.txt"]).unwrap();
        assert!(discard(&repo.0, &target, true).is_err());
        assert_eq!(content(&repo, "selected.txt"), "second\n");
        assert!(crate::stash::list(&repo.0).unwrap().is_empty());
        assert!(preview(&repo.0, &["../outside".into()]).is_err());
        assert!(preview(&repo.0, &[]).is_err());
    }
}
