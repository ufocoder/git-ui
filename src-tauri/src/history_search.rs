use crate::{
    CommitPage, PAGE_SIZE, Projects, git_command::git_cancellable, history::parse_commit_log,
    locale, project_path,
};
use serde::Deserialize;
use std::{collections::HashSet, path::Path, sync::Arc};
mod runtime;
use runtime::{Cancellation, SearchRequest};
use tauri::{State, WebviewWindow};

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default)]
pub struct HistoryFilter {
    pub text: String,
    pub sha: String,
    pub author: String,
    pub file: String,
}

fn empty_page() -> CommitPage {
    CommitPage {
        commits: Vec::new(),
        has_more: false,
    }
}
fn valid_tip(tip: &str) -> bool {
    [40, 64].contains(&tip.len()) && tip.bytes().all(|ch| ch.is_ascii_hexdigit())
}

#[cfg(test)]
pub fn page(
    path: &Path,
    local_tip: &str,
    remote_tip: Option<&str>,
    scope: &str,
    filter: &HistoryFilter,
    offset: usize,
) -> Result<CommitPage, String> {
    page_with_branches(path, local_tip, remote_tip, scope, filter, offset, true)
}

#[cfg(test)]
pub fn page_with_branches(
    path: &Path,
    local_tip: &str,
    remote_tip: Option<&str>,
    scope: &str,
    filter: &HistoryFilter,
    offset: usize,
    all_branches: bool,
) -> Result<CommitPage, String> {
    page_at_tips(
        path,
        local_tip,
        remote_tip,
        scope,
        filter,
        offset,
        all_branches,
        None,
        false,
    )
}

#[cfg(test)]
pub fn page_at_tips(
    path: &Path,
    local_tip: &str,
    remote_tip: Option<&str>,
    scope: &str,
    filter: &HistoryFilter,
    offset: usize,
    all_branches: bool,
    tips: Option<&[String]>,
    first_parent: bool,
) -> Result<CommitPage, String> {
    search_page(
        path,
        local_tip,
        remote_tip,
        scope,
        filter,
        offset,
        all_branches,
        tips,
        first_parent,
        &Cancellation::default(),
    )
}

fn search_page(
    path: &Path,
    local_tip: &str,
    remote_tip: Option<&str>,
    scope: &str,
    filter: &HistoryFilter,
    offset: usize,
    all_branches: bool,
    tips: Option<&[String]>,
    first_parent: bool,
    cancellation: &Cancellation,
) -> Result<CommitPage, String> {
    cancellation.check()?;
    if tips.is_some_and(|tips| tips.iter().any(|tip| !valid_tip(tip))) {
        return Err(locale::text("error.invalid-history").into());
    }
    if !["all", "incoming", "outgoing"].contains(&scope) {
        return Err(locale::text("sync.invalid-direction").into());
    }
    if local_tip.is_empty() {
        return Ok(empty_page());
    }
    if !valid_tip(local_tip) {
        return Err(locale::text("error.invalid-history").into());
    }
    let revision = if scope == "all" {
        local_tip.to_string()
    } else {
        let Some(remote_tip) = remote_tip else {
            return Ok(empty_page());
        };
        if !valid_tip(remote_tip) {
            return Err(locale::text("error.invalid-history").into());
        }
        if scope == "incoming" {
            format!("{local_tip}..{remote_tip}")
        } else {
            format!("{remote_tip}..{local_tip}")
        }
    };
    let text = filter.text.trim();
    let sha = filter.sha.trim();
    let author = filter.author.trim();
    let file = filter.file.strip_prefix("./").unwrap_or(&filter.file);
    if [text, sha, author, file]
        .iter()
        .any(|value| value.contains('\0'))
    {
        return Err(locale::text("search.invalid-filter").into());
    }
    if file.starts_with('/') || file.split('/').any(|part| part == "..") {
        return Err(locale::text("search.invalid-filter").into());
    }
    if !sha.is_empty()
        && (!(4..=64).contains(&sha.len()) || !sha.bytes().all(|ch| ch.is_ascii_hexdigit()))
    {
        return Ok(empty_page());
    }

    let run = |args: &[String]| -> Result<String, String> {
        cancellation.check()?;
        git_cancellable(
            path,
            &args.iter().map(String::as_str).collect::<Vec<_>>(),
            &cancellation.0,
        )
    };
    // Freeze moving refs into commit IDs before reading or looking up a query.
    // Explicit snapshots from the frontend remain valid after branches advance.
    let resolve_branches = scope == "all" && all_branches && tips.is_none();
    let mut ref_args = vec![
        "for-each-ref".into(),
        "--format=%(refname)%00%(objectname)".into(),
        "refs/replace/".into(),
    ];
    if resolve_branches {
        ref_args.extend(["refs/heads/".into(), "refs/remotes/".into()]);
    }
    let refs = run(&ref_args)?;
    let mut branch_args = if scope == "all" && all_branches {
        tips.unwrap_or_default().to_vec()
    } else {
        vec![]
    };
    let mut replacements = vec![];
    for line in refs.lines() {
        if let Some((name, hash)) = line.split_once('\0') {
            if name.starts_with("refs/replace/") {
                replacements.push(line.to_string());
            } else if resolve_branches {
                branch_args.push(hash.to_string());
            }
        }
    }
    branch_args.sort_unstable();
    branch_args.dedup();
    let shallow_path = run(&["rev-parse".into(), "--git-path".into(), "shallow".into()])?;
    let shallow_path = Path::new(shallow_path.trim());
    let shallow = match std::fs::read(if shallow_path.is_absolute() {
        shallow_path.to_path_buf()
    } else {
        path.join(shallow_path)
    }) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => vec![],
        Err(error) => return Err(error.to_string()),
    };
    let mut candidates = vec![
        "--no-pager".into(),
        "log".into(),
        "--topo-order".into(),
        "--no-show-signature".into(),
        "--regexp-ignore-case".into(),
        "--fixed-strings".into(),
        "--format=%H".into(),
    ];
    if first_parent {
        candidates.push("--first-parent".into());
    }
    candidates.extend(branch_args.iter().cloned());
    if !author.is_empty() {
        candidates.push(format!("--author={author}"));
    }
    let constraint = if file.is_empty() {
        vec![]
    } else {
        vec![format!(":(literal){file}")]
    };
    let read_hashes = |extra: Vec<String>, paths: Vec<String>| -> Result<Vec<String>, String> {
        let mut command = candidates.clone();
        command.extend(extra);
        command.extend([revision.clone(), "--".into()]);
        command.extend(paths);
        Ok(run(&command)?.lines().map(str::to_owned).collect())
    };
    let format = "--format=%H%x00%an%x00%aI%x00%s%x00%P";
    if text.is_empty() && sha.is_empty() {
        let mut command = candidates;
        command.retain(|arg| !arg.starts_with("--format="));
        command.extend([
            format!("--max-count={}", PAGE_SIZE + 1),
            format!("--skip={offset}"),
            format.into(),
            "-z".into(),
            revision,
            "--".into(),
        ]);
        command.extend(constraint);
        return parse_commit_log(path, &run(&command)?);
    }
    let key = serde_json::to_string(&(
        path,
        &revision,
        &branch_args,
        first_parent,
        text,
        sha.to_ascii_lowercase(),
        author,
        file,
        &replacements,
        &shallow,
    ))
    .map_err(|error| error.to_string())?;
    let hashes = if let Some(hashes) = runtime::cached(&key) {
        hashes
    } else {
        let messages: HashSet<_> = if text.is_empty() {
            HashSet::new()
        } else {
            read_hashes(vec![format!("--grep={text}")], constraint.clone())?
                .into_iter()
                .collect()
        };
        let paths: HashSet<_> = if text.is_empty() {
            HashSet::new()
        } else {
            let query = text.strip_prefix("./").unwrap_or(text);
            // Bracket expressions survive Git for Windows path normalization;
            // backslash escaping of '[' and ']' does not.
            let escaped: String = query.chars().map(|ch| match ch {
                '[' => "[[]".into(),
                ']' => "[]]".into(),
                '*' => "[*]".into(),
                '?' => "[?]".into(),
                '\\' => "\\\\".into(),
                other => other.to_string(),
            }).collect();
            read_hashes(
                vec![],
                vec![
                    format!(":(icase,glob)**/*{escaped}*"),
                    format!(":(icase,glob)**/*{escaped}*/**"),
                ],
            )?
            .into_iter()
            .collect()
        };
        let implicit_sha = sha.is_empty()
            && (4..=64).contains(&text.len())
            && text.bytes().all(|ch| ch.is_ascii_hexdigit());
        let prefix = text.to_ascii_lowercase();
        let explicit_prefix = sha.to_ascii_lowercase();
        let hashes = Arc::new(
            read_hashes(vec![], constraint)?
                .into_iter()
                .filter(|hash| {
                    (sha.is_empty() || hash.starts_with(&explicit_prefix))
                        && (text.is_empty()
                            || messages.contains(hash)
                            || paths.contains(hash)
                            || (implicit_sha && hash.starts_with(&prefix)))
                })
                .collect::<Vec<_>>(),
        );
        cancellation.check()?;
        runtime::remember(key, hashes.clone());
        hashes
    };
    cancellation.check()?;
    let selected = hashes.iter().skip(offset).take(PAGE_SIZE + 1);
    if selected.len() == 0 {
        return Ok(empty_page());
    }
    let mut command = vec![
        "--no-pager".into(),
        "log".into(),
        "--no-walk=unsorted".into(),
        "--no-show-signature".into(),
        format.into(),
        "-z".into(),
    ];
    command.extend(selected.cloned());
    command.push("--".into());
    let result = parse_commit_log(path, &run(&command)?);
    cancellation.check()?;
    result
}

#[tauri::command]
pub fn cancel_history_search(window: WebviewWindow, request_id: String) {
    runtime::cancel(window.label(), &request_id);
}

#[tauri::command]
pub async fn get_filtered_commit_page(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    local_tip: String,
    remote_tip: Option<String>,
    scope: String,
    filter: HistoryFilter,
    offset: usize,
    all_branches: Option<bool>,
    tips: Option<Vec<String>>,
    first_parent: Option<bool>,
    request_id: String,
) -> Result<CommitPage, String> {
    let path = project_path(&window, &projects)?;
    let request = SearchRequest::begin(window.label(), &request_id);
    tauri::async_runtime::spawn_blocking(move || {
        search_page(
            Path::new(&path),
            &local_tip,
            remote_tip.as_deref(),
            &scope,
            &filter,
            offset,
            all_branches.unwrap_or(true),
            tips.as_deref(),
            first_parent.unwrap_or(false),
            &request.cancellation,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod cache_tests {
    use super::*;
    use crate::git;
    use crate::tests::{TempRepo, commit_file};
    fn query(
        repo: &TempRepo,
        tip: &str,
        text: &str,
        offset: usize,
        tips: Option<&[String]>,
    ) -> CommitPage {
        page_at_tips(
            &repo.0,
            tip,
            None,
            "all",
            &HistoryFilter {
                text: text.into(),
                ..Default::default()
            },
            offset,
            true,
            tips,
            false,
        )
        .unwrap()
    }
    #[test]
    fn reuses_pages_and_negative_results_but_invalidates_moving_refs() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "one", "needle first");
        commit_file(&repo, "two", "needle second");
        let tip = git(&repo.0, &["rev-parse", "HEAD"])
            .unwrap()
            .trim()
            .to_string();
        let first = query(&repo, &tip, "needle", 0, None);
        let before = runtime::hits();
        assert_eq!(
            query(&repo, &tip, "needle", 1, None).commits[0].hash,
            first.commits[1].hash
        );
        assert_eq!(runtime::hits(), before + 1);
        assert!(query(&repo, &tip, "absent", 0, None).commits.is_empty());
        let before = runtime::hits();
        assert!(query(&repo, &tip, "absent", 50, None).commits.is_empty());
        assert_eq!(runtime::hits(), before + 1);
        let frozen = vec![tip.clone()];
        assert_eq!(
            query(&repo, &tip, "needle", 0, Some(&frozen)).commits.len(),
            2
        );
        commit_file(&repo, "three", "needle absent newest");
        let before = runtime::hits();
        assert_eq!(query(&repo, &tip, "needle", 0, None).commits.len(), 3);
        assert_eq!(runtime::hits(), before);
        assert_eq!(
            query(&repo, &tip, "needle", 0, Some(&frozen)).commits.len(),
            2
        );
        assert_eq!(query(&repo, &tip, "absent", 0, None).commits.len(), 1);
    }
    #[test]
    fn invalidates_shallow_boundaries_and_replacement_objects() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "one", "needle first");
        let root = git(&repo.0, &["rev-parse", "HEAD"])
            .unwrap()
            .trim()
            .to_string();
        commit_file(&repo, "two", "needle second");
        let tip = git(&repo.0, &["rev-parse", "HEAD"])
            .unwrap()
            .trim()
            .to_string();
        assert_eq!(query(&repo, &tip, "needle", 0, None).commits.len(), 2);
        std::fs::write(repo.0.join(".git/shallow"), format!("{tip}\n")).unwrap();
        assert_eq!(query(&repo, &tip, "needle", 0, None).commits.len(), 1);
        std::fs::remove_file(repo.0.join(".git/shallow")).unwrap();
        assert_eq!(query(&repo, &tip, "second", 0, None).commits.len(), 1);
        git(&repo.0, &["replace", &tip, &root]).unwrap();
        assert!(query(&repo, &tip, "second", 0, None).commits.is_empty());
    }
    #[test]
    #[ignore = "read-only timing on a separately supplied large repository"]
    fn benchmark_large_repository() {
        let path = std::env::var("GIT_UI_BENCH_REPO").expect("GIT_UI_BENCH_REPO");
        let path = Path::new(&path);
        let tip = git(path, &["rev-parse", "HEAD"])
            .unwrap()
            .trim()
            .to_string();
        for (query, offset) in [
            ("router", 0),
            ("router", 50),
            ("router", 0),
            ("zzzz-no-such-commit-7319", 0),
            ("zzzz-no-such-commit-7319", 0),
        ] {
            let start = std::time::Instant::now();
            let result = page(
                path,
                &tip,
                None,
                "all",
                &HistoryFilter {
                    text: query.into(),
                    ..Default::default()
                },
                offset,
            )
            .unwrap();
            println!(
                "query={query:?} offset={offset} commits={} elapsed_ms={:.1}",
                result.commits.len(),
                start.elapsed().as_secs_f64() * 1000.0
            );
        }
    }
}
