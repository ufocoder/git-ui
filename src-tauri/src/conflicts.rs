use crate::{
    CommitFile, ProjectHistory, Projects, git, git_bytes, locale, project_path, read_history,
    read_worktree_files,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};
use tauri::{State, WebviewWindow};

const LIMIT: usize = 2 * 1024 * 1024;
static NEXT_FILE: AtomicUsize = AtomicUsize::new(1);
#[derive(Clone, Serialize)]
pub struct Version {
    pub exists: bool,
    pub text: Option<String>,
    pub binary: bool,
    pub large: bool,
    pub mode: Option<String>,
    pub oid: Option<String>,
}
#[derive(Serialize)]
pub struct Conflict {
    pub file: CommitFile,
    pub base: Version,
    pub ours: Version,
    pub theirs: Version,
    pub working_text: Option<String>,
    pub editable: bool,
    pub supported: bool,
    pub token: String,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Resolution {
    Manual { content: String },
    Ours,
    Theirs,
}

fn target(path: &Path, file: &str) -> Result<PathBuf, String> {
    let relative = Path::new(file);
    if file.is_empty()
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        || relative.components().any(|part| {
            part.as_os_str()
                .to_string_lossy()
                .eq_ignore_ascii_case(".git")
        })
    {
        return Err(locale::text("conflict.unsafe-path").into());
    }
    let target = path.join(relative);
    let mut ancestor = target.parent().ok_or(locale::text("conflict.unsafe-path"))?;
    while !ancestor.exists() {
        ancestor = ancestor.parent().ok_or(locale::text("conflict.unsafe-path"))?;
    }
    if !ancestor
        .canonicalize()
        .map_err(|e| e.to_string())?
        .starts_with(path.canonicalize().map_err(|e| e.to_string())?)
    {
        return Err(locale::text("conflict.unsafe-path").into());
    }
    Ok(target)
}
fn version(path: &Path, stage: Option<(&str, &str)>) -> Result<Version, String> {
    let Some((mode, oid)) = stage else {
        return Ok(Version {
            exists: false,
            text: None,
            binary: false,
            large: false,
            mode: None,
            oid: None,
        });
    };
    let mut value = Version {
        exists: true,
        text: None,
        binary: false,
        large: false,
        mode: Some(mode.into()),
        oid: Some(oid.into()),
    };
    if !["100644", "100755", "120000"].contains(&mode) {
        return Ok(value);
    }
    let size = git(path, &["cat-file", "-s", oid])?
        .trim()
        .parse::<usize>()
        .map_err(|e| e.to_string())?;
    if size > LIMIT {
        value.large = true;
        return Ok(value);
    }
    let bytes = git_bytes(path, &["cat-file", "blob", oid])?;
    value.binary = bytes.contains(&0) || std::str::from_utf8(&bytes).is_err();
    if !value.binary {
        value.text = String::from_utf8(bytes).ok();
    }
    Ok(value)
}
fn regular(version: &Version) -> bool {
    !version.exists || matches!(version.mode.as_deref(), Some("100644" | "100755"))
}

pub fn read(path: &Path, file: &str) -> Result<Conflict, String> {
    let file_entry = read_worktree_files(path)?
        .into_iter()
        .find(|entry| entry.path == file && entry.status == "U")
        .ok_or(locale::text("conflict.stale-file"))?;
    let target = target(path, file)?;
    let index = git(
        path,
        &[
            "ls-files",
            "--stage",
            "-z",
            "--",
            &format!(":(literal){file}"),
        ],
    )?;
    let stages: Vec<_> = index
        .split_terminator('\0')
        .filter_map(|entry| {
            let (metadata, name) = entry.split_once('\t')?;
            let parts: Vec<_> = metadata.split_whitespace().collect();
            if name != file || parts.len() != 3 {
                return None;
            }
            Some((parts[2], (parts[0], parts[1])))
        })
        .collect();
    let base = version(
        path,
        stages
            .iter()
            .find(|(stage, _)| *stage == "1")
            .map(|(_, value)| *value),
    )?;
    let ours = version(
        path,
        stages
            .iter()
            .find(|(stage, _)| *stage == "2")
            .map(|(_, value)| *value),
    )?;
    let theirs = version(
        path,
        stages
            .iter()
            .find(|(stage, _)| *stage == "3")
            .map(|(_, value)| *value),
    )?;
    let supported = !stages.is_empty()
        && stages
            .iter()
            .all(|(_, (mode, _))| ["100644", "100755", "120000"].contains(mode));
    let (working_text, working_id, working_regular) = match fs::symlink_metadata(&target) {
        Ok(metadata) if metadata.file_type().is_symlink() => (
            None,
            format!(
                "link:{:?}",
                fs::read_link(&target).map_err(|e| e.to_string())?
            ),
            false,
        ),
        Ok(metadata) if metadata.is_file() => {
            let hash = git(
                path,
                &[
                    "hash-object",
                    "--no-filters",
                    "--",
                    target.to_str().ok_or(locale::text("conflict.unsafe-path"))?,
                ],
            )?;
            let text = if metadata.len() <= LIMIT as u64 {
                let bytes = fs::read(&target).map_err(|e| e.to_string())?;
                if bytes.contains(&0) {
                    None
                } else {
                    String::from_utf8(bytes).ok()
                }
            } else {
                None
            };
            let fingerprint = format!("{}:{:?}", hash.trim(), metadata.permissions());
            (text, fingerprint, true)
        }
        Ok(_) => (None, "directory".into(), false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            (None, "missing".into(), true)
        }
        Err(error) => return Err(error.to_string()),
    };
    let editable = supported
        && working_regular
        && regular(&ours)
        && regular(&theirs)
        && !ours.binary
        && !theirs.binary
        && !ours.large
        && !theirs.large
        && (working_text.is_some() || working_id == "missing");
    let head = git(path, &["rev-parse", "--revs-only", "HEAD"])?;
    let branch = git(path, &["branch", "--show-current"])?;
    Ok(Conflict {
        file: file_entry,
        base,
        ours,
        theirs,
        working_text,
        editable,
        supported,
        token: format!("{head}\n{branch}\n{index}\n{working_id}"),
    })
}

fn write_atomic(target: &Path, text: &str) -> Result<(), String> {
    let parent = target.parent().ok_or(locale::text("conflict.unsafe-path"))?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = parent.join(format!(
        ".git-ui-conflict-{}-{}.tmp",
        std::process::id(),
        NEXT_FILE.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|error| error.to_string())?;
    let result = (|| {
        file.write_all(text.as_bytes())?;
        if let Ok(metadata) = fs::metadata(target) {
            file.set_permissions(metadata.permissions())?;
        }
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|e: std::io::Error| e.to_string())
}

pub fn resolve(
    path: &Path,
    file: &str,
    token: &str,
    resolution: Resolution,
) -> Result<ProjectHistory, String> {
    let current = read(path, file)?;
    if current.token != token {
        return Err(locale::text("conflict.stale-state").into());
    }
    if !current.supported {
        return Err(locale::text("conflict.unsupported").into());
    }
    let target = target(path, file)?;
    let literal = format!(":(literal){file}");
    let selected = match &resolution {
        Resolution::Ours => Some(&current.ours),
        Resolution::Theirs => Some(&current.theirs),
        _ => None,
    };
    if let Resolution::Manual { content } = &resolution {
        if !current.editable || content.len() > LIMIT {
            return Err(locale::text("conflict.readonly").into());
        }
        if content.lines().any(|line| {
            line.starts_with("<<<<<<< ")
                || line.starts_with(">>>>>>> ")
                || line.starts_with("||||||| ")
        }) {
            return Err(locale::text("conflict.markers").into());
        }
        write_atomic(&target, content)?;
    } else if selected.is_some_and(|value| !value.exists) {
        git(path, &["rm", "--force", "--", &literal])?;
        return read_history(path);
    } else {
        let flag = if matches!(resolution, Resolution::Ours) {
            "--ours"
        } else {
            "--theirs"
        };
        git(path, &["checkout", flag, "--", &literal])?;
    }
    git(path, &["add", "--", &literal])
        .map_err(|error| locale::format("conflict.stage-error", &[("p1", error)]))?;
    read_history(path)
}

#[tauri::command]
pub async fn get_conflict_file(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    file: String,
) -> Result<Conflict, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || read(Path::new(&path), &file))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn resolve_conflict_file(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    file: String,
    token: String,
    resolution: Resolution,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || {
        resolve(Path::new(&path), &file, &token, resolution)
    })
    .await
    .map_err(|e| e.to_string())?
}
