use crate::{CommitPage, PAGE_SIZE, Projects, git, locale, parse_commit_log, project_path};
use serde::Deserialize;
use std::{collections::HashSet, path::Path};
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

pub fn page(
    path: &Path,
    local_tip: &str,
    remote_tip: Option<&str>,
    scope: &str,
    filter: &HistoryFilter,
    offset: usize,
) -> Result<CommitPage, String> {
    if !["all", "incoming", "outgoing"].contains(&scope) {
        return Err(locale::text("sync09").into());
    }
    if local_tip.is_empty() {
        return Ok(empty_page());
    }
    if !valid_tip(local_tip) {
        return Err(locale::text("err12").into());
    }
    let revision = if scope == "all" {
        local_tip.to_string()
    } else {
        let Some(remote_tip) = remote_tip else {
            return Ok(empty_page());
        };
        if !valid_tip(remote_tip) {
            return Err(locale::text("err12").into());
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
        return Err(locale::text("find08").into());
    }
    if file.starts_with('/') || file.split('/').any(|part| part == "..") {
        return Err(locale::text("find08").into());
    }
    if !sha.is_empty()
        && (!(4..=64).contains(&sha.len()) || !sha.bytes().all(|ch| ch.is_ascii_hexdigit()))
    {
        return Ok(empty_page());
    }
    let mut args = vec![
        "--no-pager".into(),
        "log".into(),
        "--topo-order".into(),
        format!("--max-count={}", PAGE_SIZE + 1),
        format!("--skip={offset}"),
        "--no-show-signature".into(),
        "--format=%H%x00%an%x00%aI%x00%s%x00%P".into(),
        "-z".into(),
        "--regexp-ignore-case".into(),
        "--fixed-strings".into(),
    ];
    if !author.is_empty() {
        args.push(format!("--author={author}"));
    }
    // SHA input is matched only against commits reachable in the chosen scope
    // and touching the chosen path, never against arbitrary refs or options.
    let sha_search = !sha.is_empty()
        || ((4..=64).contains(&text.len()) && text.bytes().all(|ch| ch.is_ascii_hexdigit()));
    if sha_search {
        let mut candidates = vec![
            "--no-pager".to_string(),
            "log".into(),
            "--topo-order".into(),
            "--format=%H".into(),
            "--no-show-signature".into(),
            "--regexp-ignore-case".into(),
            "--fixed-strings".into(),
        ];
        if !author.is_empty() {
            candidates.push(format!("--author={author}"));
        }
        if !sha.is_empty() && !text.is_empty() {
            candidates.push(format!("--grep={text}"));
        }
        candidates.extend([revision.clone(), "--".into()]);
        if !file.is_empty() {
            candidates.push(format!(":(literal){file}"));
        }
        let hashes = git(
            path,
            &candidates.iter().map(String::as_str).collect::<Vec<_>>(),
        )?;
        let mut message_args = vec![
            "--no-pager".to_string(),
            "log".into(),
            "--format=%H".into(),
            "--no-show-signature".into(),
            "--regexp-ignore-case".into(),
            "--fixed-strings".into(),
            format!("--grep={text}"),
            revision,
            "--".into(),
        ];
        if !file.is_empty() {
            message_args.push(format!(":(literal){file}"));
        }
        let message_hashes = git(
            path,
            &message_args.iter().map(String::as_str).collect::<Vec<_>>(),
        )?;
        let message_hashes: HashSet<_> = message_hashes.lines().collect();
        let prefix = if sha.is_empty() { text } else { sha }.to_ascii_lowercase();
        let matches: Vec<_> = hashes
            .lines()
            .filter(|hash| {
                hash.starts_with(&prefix) || (sha.is_empty() && message_hashes.contains(hash))
            })
            .skip(offset)
            .take(PAGE_SIZE + 1)
            .collect();
        if matches.is_empty() {
            return Ok(empty_page());
        }
        args.retain(|arg| arg != "--topo-order" && !arg.starts_with("--skip="));
        args.push("--no-walk=unsorted".into());
        args.extend(matches.into_iter().map(str::to_owned));
    } else {
        if !text.is_empty() {
            args.push(format!("--grep={text}"));
        }
        args.push(revision);
    }
    args.push("--".into());
    if !file.is_empty() && !sha_search {
        args.push(format!(":(literal){file}"));
    }
    let log = git(path, &args.iter().map(String::as_str).collect::<Vec<_>>())?;
    parse_commit_log(path, &log)
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
) -> Result<CommitPage, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        page(
            Path::new(&path),
            &local_tip,
            remote_tip.as_deref(),
            &scope,
            &filter,
            offset,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}
