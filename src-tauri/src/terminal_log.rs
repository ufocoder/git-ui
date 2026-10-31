use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        Mutex, OnceLock,
        atomic::{AtomicUsize, Ordering},
    },
};

#[derive(Clone, Debug, Serialize)]
pub struct TerminalLog {
    pub id: usize,
    pub command: String,
    pub output: String,
    pub status: String,
    pub exit_code: Option<i32>,
}
static LOGS: OnceLock<Mutex<HashMap<PathBuf, TerminalLog>>> = OnceLock::new();
static NEXT_ID: AtomicUsize = AtomicUsize::new(1);
fn logs() -> &'static Mutex<HashMap<PathBuf, TerminalLog>> {
    LOGS.get_or_init(|| Mutex::new(HashMap::new()))
}
fn key(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_owned())
}

pub fn begin(path: &Path, args: &[&str]) -> Option<usize> {
    let operation = matches!(
        args.first().copied(),
        Some(
            "init"
                | "switch"
                | "cherry-pick"
                | "revert"
                | "merge"
                | "checkout"
                | "reset"
                | "add"
                | "rm"
                | "commit"
                | "fetch"
                | "pull"
                | "push"
                | "tag"
        )
    ) || args.first() == Some(&"stash")
        && matches!(args.get(1).copied(), Some("push" | "apply" | "drop"))
        || args.first() == Some(&"branch")
            && args.get(1).is_some_and(|name| {
                !name.starts_with('-') || name.starts_with("--set-upstream-to=")
            })
        || args.first() == Some(&"remote") && args.get(1) == Some(&"add");
    if !operation {
        return None;
    }
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let command = format!(
        "git {}",
        args.iter()
            .map(|arg| if arg.chars().any(char::is_whitespace) {
                format!("{arg:?}")
            } else {
                (*arg).to_owned()
            })
            .collect::<Vec<_>>()
            .join(" ")
    );
    logs().lock().ok()?.insert(
        key(path),
        TerminalLog {
            id,
            command,
            output: String::new(),
            status: "running".into(),
            exit_code: None,
        },
    );
    Some(id)
}
pub fn finish(
    path: &Path,
    id: Option<usize>,
    output: String,
    success: bool,
    exit_code: Option<i32>,
) {
    let Some(id) = id else {
        return;
    };
    let Ok(mut logs) = logs().lock() else {
        return;
    };
    let Some(log) = logs.get_mut(&key(path)) else {
        return;
    };
    if log.id != id {
        return;
    }
    let mut output = output;
    const LIMIT: usize = 200_000;
    if output.len() > LIMIT {
        let mut end = LIMIT;
        while !output.is_char_boundary(end) {
            end -= 1;
        }
        output.truncate(end);
        output.push_str("\n… Вывод сокращён до 200 КБ.");
    }
    log.output = output;
    log.status = if success { "success" } else { "error" }.into();
    log.exit_code = exit_code;
}
pub fn latest(path: &Path) -> Result<Option<TerminalLog>, String> {
    Ok(logs()
        .lock()
        .map_err(|e| e.to_string())?
        .get(&key(path))
        .cloned())
}
