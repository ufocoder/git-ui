use crate::{git, locale, project_path, BranchComparison, Projects};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tauri::{State, WebviewWindow};

type CacheKey = (PathBuf, String, String);
static CACHE: OnceLock<Mutex<HashMap<CacheKey, (usize, usize)>>> = OnceLock::new();

pub(crate) fn read(
    path: &Path,
    head: &str,
    names: &[String],
) -> Result<HashMap<String, BranchComparison>, String> {
    if head.is_empty() {
        return Ok(HashMap::new());
    }
    let output = git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(objectname)%00%(upstream)",
            "refs/heads/",
            "refs/remotes/",
        ],
    )?;
    let refs: Vec<Vec<&str>> = output
        .lines()
        .map(|line| line.split('\0').collect())
        .filter(|fields: &Vec<_>| fields.len() == 3)
        .collect();
    let tips: HashMap<&str, &str> = refs.iter().map(|fields| (fields[0], fields[1])).collect();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut result = HashMap::new();
    for fields in &refs {
        let Some(name) = fields[0].strip_prefix("refs/heads/") else {
            continue;
        };
        if !names.iter().any(|requested| requested == name) {
            continue;
        }
        let (base, tip) = tips
            .get(fields[2])
            .map(|tip| {
                (
                    fields[2].strip_prefix("refs/remotes/").unwrap_or(fields[2]),
                    *tip,
                )
            })
            .unwrap_or(("HEAD", head));
        let key = (path.to_owned(), fields[1].to_owned(), tip.to_owned());
        let cached = cache
            .lock()
            .map_err(|error| error.to_string())?
            .get(&key)
            .copied();
        let (ahead, behind) = if let Some(counts) = cached {
            counts
        } else {
            let counts = if fields[1] == tip {
                (0, 0)
            } else {
                let range = format!("{}...{tip}", fields[1]);
                let counts = git(path, &["rev-list", "--left-right", "--count", &range, "--"])?;
                let values: Vec<_> = counts.split_whitespace().collect();
                if values.len() != 2 {
                    return Err(locale::text("err08").into());
                }
                (
                    values[0].parse().map_err(|_| locale::text("err08"))?,
                    values[1].parse().map_err(|_| locale::text("err08"))?,
                )
            };
            let mut cache = cache.lock().map_err(|error| error.to_string())?;
            if cache.len() >= 4096 {
                cache.clear();
            }
            cache.insert(key, counts);
            counts
        };
        result.insert(
            name.to_owned(),
            BranchComparison {
                base: base.into(),
                ahead,
                behind,
            },
        );
    }
    Ok(result)
}

#[tauri::command]
pub async fn get_branch_comparisons(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    names: Vec<String>,
) -> Result<HashMap<String, BranchComparison>, String> {
    if names.len() > 32 {
        return Err(locale::text("err12").into());
    }
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&path);
        let head = git(path, &["rev-parse", "--revs-only", "HEAD"])?;
        read(path, head.trim(), &names)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{commit_file, TempRepo};
    use std::{io::Write, process::Stdio};

    #[test]
    fn thousands_of_refs_do_not_block_history_or_overflow_revision_arguments() {
        let repo = TempRepo::new();
        repo.init();
        commit_file(&repo, "base", "Base");
        git(
            &repo.0,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.com",
                "-c",
                "tag.gpgsign=false",
                "tag",
                "-a",
                "release",
                "-m",
                "Release",
            ],
        )
        .unwrap();
        let head = git(&repo.0, &["rev-parse", "HEAD"])
            .unwrap()
            .trim()
            .to_owned();
        let tag = git(&repo.0, &["rev-parse", "refs/tags/release"])
            .unwrap()
            .trim()
            .to_owned();
        let mut updates = String::new();
        for index in 0..3000 {
            updates.push_str(&format!("create refs/heads/topic-{index:04} {head}\ncreate refs/tags/release-{index:04} {tag}\n"));
        }
        let mut process = crate::process::background("git")
            .arg("-C")
            .arg(&repo.0)
            .args(["update-ref", "--stdin"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        process
            .stdin
            .take()
            .unwrap()
            .write_all(updates.as_bytes())
            .unwrap();
        assert!(process.wait().unwrap().success());
        let history = crate::read_history(&repo.0).unwrap();
        assert_eq!(history.tags.len(), 3001);
        assert_eq!(history.branches.len(), 3001);
        assert!(history.branch_comparisons.is_empty());
        assert_eq!(
            history.commits[0]
                .refs
                .iter()
                .filter(|item| item.kind == "tag")
                .count(),
            3001
        );
        let names = vec!["topic-0000".into(), "topic-2999".into()];
        let comparisons = read(&repo.0, &head, &names).unwrap();
        assert_eq!(comparisons.len(), 2);
        assert_eq!(comparisons["topic-0000"].ahead, 0);
        // Exercise stdin with a revision list too large for command arguments.
        let mut args = vec!["--no-pager", "log", "--format=%H"];
        args.extend(std::iter::repeat_n(head.as_str(), 10000));
        args.push("--");
        assert_eq!(git(&repo.0, &args).unwrap().trim(), head);
        let tips = vec![head.clone(); 10000];
        let page =
            crate::read_branch_commit_page_at_tips(&repo.0, &head, 0, true, Some(&tips)).unwrap();
        assert_eq!(page.commits.len(), 1);
    }
}
