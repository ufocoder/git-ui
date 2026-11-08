#[cfg(test)]
use crate::branch_comparisons;
use crate::{
    CommitFile, Projects, commit_ops, fetch_status, git, locale, project_path, read_worktree_files,
    stash, sync_status,
};
use serde::Serialize;
use std::{collections::HashMap, path::Path};
use tauri::{State, WebviewWindow};

#[derive(Clone, Debug, Serialize)]
pub(super) struct CommitReference {
    pub(super) name: String,
    pub(super) kind: String,
}

fn read_commit_references(path: &Path) -> Result<HashMap<String, Vec<CommitReference>>, String> {
    let output = git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(objectname)%00%(objecttype)%00%(symref)%00%(*objectname)%00%(*objecttype)",
            "refs/heads/",
            "refs/remotes/",
            "refs/tags/",
        ],
    )?;
    let mut references: HashMap<String, Vec<CommitReference>> = HashMap::new();
    for line in output.lines() {
        let fields: Vec<_> = line.split('\0').collect();
        if fields.len() != 6 || !fields[3].is_empty() {
            continue;
        }
        let (kind, name) = if let Some(name) = fields[0].strip_prefix("refs/heads/") {
            ("branch", name)
        } else if let Some(name) = fields[0].strip_prefix("refs/remotes/") {
            ("remote", name)
        } else if let Some(name) = fields[0].strip_prefix("refs/tags/") {
            ("tag", name)
        } else {
            continue;
        };
        let hash = if fields[2] == "tag" && fields[5] == "commit" {
            fields[4].to_owned()
        } else if fields[2] == "tag" {
            match git(
                path,
                &[
                    "rev-parse",
                    "--verify",
                    &format!("{}^{{commit}}", fields[0]),
                ],
            ) {
                Ok(hash) => hash.trim().to_owned(),
                Err(_) => continue,
            }
        } else if fields[2] == "commit" {
            fields[1].into()
        } else {
            continue;
        };
        references.entry(hash).or_default().push(CommitReference {
            name: name.into(),
            kind: kind.into(),
        });
    }
    Ok(references)
}

#[derive(Clone, Debug, Serialize)]
pub(super) struct Commit {
    pub(super) hash: String,
    pub(super) author: String,
    pub(super) date: String,
    pub(super) subject: String,
    pub(super) parents: Vec<String>,
    pub(super) refs: Vec<CommitReference>,
}
#[derive(Clone, Debug, Serialize)]
pub(super) struct Remote {
    pub(super) name: String,
    pub(super) branches: Vec<String>,
}

pub(super) fn read_remotes(path: &Path) -> Result<Vec<Remote>, String> {
    let names = git(path, &["remote"])?;
    names
        .lines()
        .map(|name| {
            let prefix = format!("refs/remotes/{name}/");
            let refs = git(
                path,
                &["for-each-ref", "--format=%(refname)%00%(symref)", &prefix],
            )?;
            let branches = refs
                .lines()
                .filter_map(|line| {
                    let (reference, symbolic) = line.split_once('\0')?;
                    if !symbolic.is_empty() {
                        return None;
                    }
                    reference.strip_prefix(&prefix).map(str::to_owned)
                })
                .collect();
            Ok(Remote {
                name: name.into(),
                branches,
            })
        })
        .collect()
}

#[derive(Clone, Debug, Serialize)]
pub(super) struct BranchComparison {
    pub(super) base: String,
    pub(super) ahead: usize,
    pub(super) behind: usize,
}

#[cfg(test)]
pub(super) fn read_branch_comparisons(
    path: &Path,
    head: &str,
) -> Result<HashMap<String, BranchComparison>, String> {
    let names = git(
        path,
        &["for-each-ref", "--format=%(refname:strip=2)", "refs/heads/"],
    )?;
    branch_comparisons::read(
        path,
        head,
        &names.lines().map(str::to_owned).collect::<Vec<_>>(),
    )
}

#[derive(Clone, Debug, Serialize)]
pub(super) struct ProjectHistory {
    pub(super) path: String,
    pub(super) commits: Vec<Commit>,
    pub(super) branches: Vec<String>,
    pub(super) branch_comparisons: HashMap<String, BranchComparison>,
    pub(super) tag_tips: HashMap<String, String>,
    pub(super) branch_tips: HashMap<String, String>,
    pub(super) tags: Vec<String>,
    pub(super) stashes: Vec<stash::StashEntry>,
    pub(super) remotes: Vec<Remote>,
    pub(super) current_branch: String,
    pub(super) sync: sync_status::SyncStatus,
    pub(super) last_fetch: Option<u64>,
    pub(super) operation: Option<commit_ops::Operation>,
    pub(super) conflicts: Vec<CommitFile>,
    pub(super) tip: String,
    pub(super) has_more: bool,
    pub(super) has_changes: bool,
    pub(super) worktree_files: Vec<CommitFile>,
}
pub(super) fn read_history(path: &Path) -> Result<ProjectHistory, String> {
    let path = path
        .canonicalize()
        .map_err(|_| locale::text("error.folder-unavailable").to_string())?;
    if !path.is_dir() || !path.join(".git").is_dir() {
        return Err(locale::text("error.no-git").into());
    }
    git(&path, &["rev-parse", "--git-dir"])?;
    let refs = git(&path, &["rev-parse", "--revs-only", "HEAD"])?;
    let tip = refs.trim().to_owned();
    let branch_tips: HashMap<String, String> = git(
        &path,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(objectname)",
            "refs/heads/",
            "refs/remotes/",
        ],
    )?
    .lines()
    .filter_map(|line| {
        line.split_once('\0')
            .map(|(name, tip)| (name.to_owned(), tip.to_owned()))
    })
    .collect();
    let mut tips: Vec<String> = branch_tips.values().cloned().collect();
    tips.sort();
    tips.dedup();
    let page = read_branch_commit_page_at_tips(&path, &tip, 0, true, Some(&tips))?;
    let working_files = read_worktree_files(&path)?;
    let current_branch = git(&path, &["branch", "--show-current"])?.trim().to_owned();
    Ok(ProjectHistory {
        conflicts: working_files
            .iter()
            .filter(|file| file.status == "U")
            .cloned()
            .collect(),
        operation: commit_ops::read(&path)?,
        stashes: stash::list(&path)?,
        sync: sync_status::read(&path, &tip, &current_branch)?,
        last_fetch: fetch_status::read(&path),
        path: path.to_string_lossy().into_owned(),
        commits: page.commits,
        branch_comparisons: HashMap::new(),
        tag_tips: read_commit_references(&path)?.into_iter().flat_map(|(hash, refs)| {
            refs.into_iter().filter(|reference| reference.kind == "tag").map(move |reference| (reference.name, hash.clone()))
        }).collect(),
        branch_tips,
        tip,
        has_more: page.has_more,
        has_changes: !working_files.is_empty(),
        worktree_files: working_files,
        tags: git(
            &path,
            &["for-each-ref", "--format=%(refname:strip=2)", "refs/tags/"],
        )?
        .lines()
        .map(str::to_owned)
        .collect(),
        remotes: read_remotes(&path)?,
        branches: git(
            &path,
            &["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
        )?
        .lines()
        .map(str::to_owned)
        .collect(),
        current_branch,
    })
}

pub(super) const PAGE_SIZE: usize = 50;
#[derive(Debug, Serialize)]
pub(super) struct CommitPage {
    pub(super) commits: Vec<Commit>,
    pub(super) has_more: bool,
}

#[cfg(test)]
pub(super) fn read_commit_page(
    path: &Path,
    tip: &str,
    offset: usize,
) -> Result<CommitPage, String> {
    read_branch_commit_page(path, tip, offset, true)
}

#[cfg(test)]
pub(super) fn read_branch_commit_page(
    path: &Path,
    tip: &str,
    offset: usize,
    all_branches: bool,
) -> Result<CommitPage, String> {
    read_branch_commit_page_at_tips(path, tip, offset, all_branches, None)
}

pub(super) fn read_branch_commit_page_at_tips(
    path: &Path,
    tip: &str,
    offset: usize,
    all_branches: bool,
    tips: Option<&[String]>,
) -> Result<CommitPage, String> {
    read_branch_page(path, tip, offset, all_branches, tips, false)
}

fn read_branch_page(
    path: &Path,
    tip: &str,
    offset: usize,
    all_branches: bool,
    tips: Option<&[String]>,
    first_parent: bool,
) -> Result<CommitPage, String> {
    if tip.is_empty() {
        return Ok(CommitPage {
            commits: vec![],
            has_more: false,
        });
    }
    if ![40, 64].contains(&tip.len()) || !tip.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(locale::text("error.invalid-history").into());
    }
    read_commit_range_with_refs(path, tip, offset, all_branches, tips, first_parent)
}

pub(super) fn read_commit_range(
    path: &Path,
    revision: &str,
    offset: usize,
) -> Result<CommitPage, String> {
    read_commit_range_with_refs(path, revision, offset, false, None, false)
}

fn read_commit_range_with_refs(
    path: &Path,
    revision: &str,
    offset: usize,
    include_refs: bool,
    tips: Option<&[String]>,
    first_parent: bool,
) -> Result<CommitPage, String> {
    let count = format!("--max-count={}", PAGE_SIZE + 1);
    let skip = format!("--skip={offset}");
    let mut args = vec![
        "--no-pager",
        "log",
        "--topo-order",
        &count,
        &skip,
        "--no-show-signature",
        "--format=%H%x00%an%x00%aI%x00%s%x00%P",
        "-z",
    ];
    if first_parent {
        args.push("--first-parent");
    }
    if include_refs {
        if let Some(tips) = tips {
            if tips.iter().any(|tip| {
                ![40, 64].contains(&tip.len()) || !tip.bytes().all(|c| c.is_ascii_hexdigit())
            }) {
                return Err(locale::text("error.invalid-history").into());
            }
            let mut unique_tips: Vec<&str> = tips.iter().map(String::as_str).collect();
            unique_tips.sort_unstable();
            unique_tips.dedup();
            args.extend(unique_tips);
        } else {
            args.extend(["--branches", "--remotes"]);
        }
    }
    args.extend([revision, "--"]);
    let log = git(path, &args)?;
    parse_commit_log(path, &log)
}

pub(super) fn parse_commit_log(path: &Path, log: &str) -> Result<CommitPage, String> {
    let references = read_commit_references(path)?;
    let fields: Vec<_> = log.split_terminator('\0').collect();
    let mut commits: Vec<_> = fields
        .chunks_exact(5)
        .map(|row| Commit {
            hash: row[0].into(),
            author: row[1].into(),
            date: row[2].into(),
            subject: row[3].into(),
            refs: references.get(row[0]).cloned().unwrap_or_default(),
            parents: row[4].split_whitespace().map(str::to_owned).collect(),
        })
        .collect();
    let has_more = commits.len() > PAGE_SIZE;
    commits.truncate(PAGE_SIZE);
    Ok(CommitPage { commits, has_more })
}

#[tauri::command]
pub(super) async fn get_commit_page(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    tip: String,
    offset: usize,
    all_branches: Option<bool>,
    tips: Option<Vec<String>>,
    first_parent: Option<bool>,
) -> Result<CommitPage, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        read_branch_page(
            Path::new(&path),
            &tip,
            offset,
            all_branches.unwrap_or(true),
            tips.as_deref(),
            first_parent.unwrap_or(false),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(super) async fn get_sync_commit_page(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    local_tip: String,
    remote_tip: String,
    direction: String,
    offset: usize,
) -> Result<CommitPage, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        sync_status::page(
            Path::new(&path),
            &local_tip,
            &remote_tip,
            &direction,
            offset,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod view_tests {
    use super::*;
    use crate::tests::{commit_all, commit_file, TempRepo};

    #[test]
    fn first_parent_history_keeps_merge_and_omits_merged_side() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "base");
        let main = git(&repo.0, &["branch", "--show-current"]).unwrap();
        git(&repo.0, &["checkout", "-b", "side"]).unwrap();
        commit_file(&repo, "side", "side");
        git(&repo.0, &["checkout", main.trim()]).unwrap();
        std::fs::write(repo.0.join("main.txt"), "main").unwrap();
        commit_all(&repo, "main");
        git(&repo.0, &["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "merge", "--no-ff", "-m", "merge", "side"]).unwrap();
        let tip = git(&repo.0, &["rev-parse", "HEAD"]).unwrap();
        let page = read_branch_page(&repo.0, tip.trim(), 0, false, None, true).unwrap();
        let subjects: Vec<_> = page.commits.iter().map(|commit| commit.subject.as_str()).collect();
        assert_eq!(subjects, ["merge", "main", "base"]);
        assert_eq!(page.commits[0].parents.len(), 2);
    }
}
