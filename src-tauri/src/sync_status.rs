use crate::{CommitPage, git, locale, read_commit_range};
use serde::Serialize;
use std::path::Path;

#[derive(Clone, Debug, Default, Serialize)]
pub struct SyncStatus {
    pub upstream: Option<String>,
    pub remote_tip: Option<String>,
    pub ahead: usize,
    pub behind: usize,
}

pub fn read(path: &Path, head: &str, branch: &str) -> Result<SyncStatus, String> {
    if head.is_empty() || branch.is_empty() {
        return Ok(SyncStatus::default());
    }
    let upstream = git(
        path,
        &[
            "for-each-ref",
            "--format=%(upstream)",
            &format!("refs/heads/{branch}"),
        ],
    )?;
    let upstream = upstream.trim();
    if upstream.is_empty() {
        return Ok(SyncStatus::default());
    }
    let upstream_name = upstream
        .strip_prefix("refs/remotes/")
        .unwrap_or(upstream)
        .to_owned();
    let remote_tip = match git(
        path,
        &["rev-parse", "--verify", &format!("{upstream}^{{commit}}")],
    ) {
        Ok(tip) => tip.trim().to_string(),
        Err(_) => {
            return Ok(SyncStatus {
                upstream: Some(upstream_name),
                ..SyncStatus::default()
            });
        }
    };
    let counts = git(
        path,
        &[
            "rev-list",
            "--left-right",
            "--count",
            &format!("{head}...{remote_tip}"),
            "--",
        ],
    )?;
    let values: Vec<_> = counts.split_whitespace().collect();
    let [ahead, behind] = values.as_slice() else {
        return Err(locale::text("err08").into());
    };
    Ok(SyncStatus {
        upstream: Some(upstream_name),
        remote_tip: Some(remote_tip),
        ahead: ahead.parse().map_err(|_| locale::text("err08"))?,
        behind: behind.parse().map_err(|_| locale::text("err08"))?,
    })
}

// Both ends are immutable object IDs from the last refresh. Pagination cannot
// jump between revisions if a fetch updates the remote reference meanwhile.
pub fn page(
    path: &Path,
    local_tip: &str,
    remote_tip: &str,
    direction: &str,
    offset: usize,
) -> Result<CommitPage, String> {
    for tip in [local_tip, remote_tip] {
        if ![40, 64].contains(&tip.len()) || !tip.bytes().all(|ch| ch.is_ascii_hexdigit()) {
            return Err(locale::text("err12").into());
        }
    }
    let range = match direction {
        "incoming" => format!("{local_tip}..{remote_tip}"),
        "outgoing" => format!("{remote_tip}..{local_tip}"),
        _ => return Err(locale::text("sync09").into()),
    };
    read_commit_range(path, &range, offset)
}
