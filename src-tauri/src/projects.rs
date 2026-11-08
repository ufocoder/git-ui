use crate::{ProjectHistory, git, locale, read_history, terminal_log};
use serde::Serialize;
use std::{collections::HashMap, path::Path, sync::Mutex};
use tauri::{Manager, State, WebviewWindow};

#[derive(Default)]
pub(super) struct Projects(Mutex<HashMap<String, String>>);

impl Projects {
    pub(super) fn remove(&self, label: &str) {
        if let Ok(mut projects) = self.0.lock() {
            projects.remove(label);
        }
    }
}

#[derive(Default)]
pub(super) struct RecentProjects(Mutex<()>);
#[derive(Serialize)]
pub(super) struct OpenProjectResult {
    history: ProjectHistory,
    recent_projects: Vec<String>,
    warning: Option<String>,
}

pub(super) fn load_recent(file: &Path) -> Result<Vec<String>, String> {
    match std::fs::read(file) {
        Ok(bytes) => {
            let paths: Vec<String> = serde_json::from_slice(&bytes)
                .map_err(|e| locale::format("error.read-recent", &[("e", e.to_string())]))?;
            let mut unique = Vec::new();
            for path in paths {
                if !unique.contains(&path) {
                    unique.push(path);
                }
            }
            unique.truncate(5);
            Ok(unique)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(locale::format("error.read-recent", &[("e", e.to_string())])),
    }
}

pub(super) fn save_recent(file: &Path, path: String) -> Result<Vec<String>, String> {
    let mut paths = load_recent(file)?;
    paths.retain(|existing| existing != &path);
    paths.insert(0, path);
    paths.truncate(5);
    let directory = file.parent().ok_or(locale::text("error.settings-dir"))?;
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let temporary = file.with_extension("tmp");
    let bytes = serde_json::to_vec_pretty(&paths).map_err(|e| e.to_string())?;
    std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, file).map_err(|e| e.to_string())?;
    Ok(paths)
}

#[tauri::command]
pub(super) fn get_recent_projects(
    app: tauri::AppHandle,
    recent: State<RecentProjects>,
) -> Result<Vec<String>, String> {
    let _guard = recent.0.lock().map_err(|e| e.to_string())?;
    let file = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("recent-projects.json");
    load_recent(&file)
}

pub(super) fn can_initialize_repository(path: &Path) -> Result<bool, String> {
    let path = path
        .canonicalize()
        .map_err(|_| locale::text("error.folder-unavailable").to_string())?;
    if !path.is_dir() {
        return Err(locale::text("error.folder-required").into());
    }
    match std::fs::symlink_metadata(path.join(".git")) {
        Ok(_) => Ok(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(locale::format("error.check-folder", &[("error", error.to_string())])),
    }
}

pub(super) fn initialize_repository(path: &Path) -> Result<(), String> {
    if !can_initialize_repository(path)? {
        return Err(locale::text("error.already-initialized").into());
    }
    git(path, &["init"])?;
    Ok(())
}

#[tauri::command]
pub(super) async fn can_initialize_project(path: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || can_initialize_repository(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(super) async fn initialize_project(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || initialize_repository(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(super) async fn open_project(
    app: tauri::AppHandle,
    window: WebviewWindow,
    path: String,
) -> Result<OpenProjectResult, String> {
    let history = tauri::async_runtime::spawn_blocking(move || read_history(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())??;
    let title = Path::new(&history.path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| history.path.clone());
    let branch = if history.current_branch.is_empty() {
        "HEAD"
    } else {
        &history.current_branch
    };
    window
        .set_title(&format!("{title} ({branch})"))
        .map_err(|e| e.to_string())?;
    let canonical_path = history.path.clone();
    app.state::<Projects>()
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(window.label().to_owned(), canonical_path.clone());
    let saved = (|| {
        let recent = app.state::<RecentProjects>();
        let _guard = recent.0.lock().map_err(|e| e.to_string())?;
        let file = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("recent-projects.json");
        save_recent(&file, canonical_path)
    })();
    Ok(match saved {
        Ok(recent_projects) => OpenProjectResult {
            history,
            recent_projects,
            warning: None,
        },
        Err(error) => OpenProjectResult {
            history,
            recent_projects: vec![],
            warning: Some(locale::format("error.save-recent", &[("error", error.to_string())])),
        },
    })
}

#[tauri::command]
pub(super) fn frontend_ready(window: WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|e| e.to_string())?;
    if !url.query_pairs().any(|(key, _)| key == "view") {
        window.set_title("").map_err(|e| e.to_string())?;
    }
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
pub(super) fn show_project_chooser(
    window: WebviewWindow,
    projects: State<'_, Projects>,
) -> Result<(), String> {
    window.set_title("").map_err(|e| e.to_string())?;
    projects
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .remove(window.label());
    Ok(())
}

pub(super) fn project_path(window: &WebviewWindow, projects: &Projects) -> Result<String, String> {
    projects
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .get(window.label())
        .cloned()
        .ok_or_else(|| locale::text("error.no-project").into())
}

#[tauri::command]
pub(super) fn get_project_terminal_log(
    window: WebviewWindow,
    projects: State<Projects>,
) -> Result<Option<terminal_log::TerminalLog>, String> {
    let path = project_path(&window, &projects)?;
    terminal_log::latest(Path::new(&path))
}

#[tauri::command]
pub(super) async fn get_project_history(
    window: WebviewWindow,
    projects: State<'_, Projects>,
) -> Result<ProjectHistory, String> {
    let path = project_path(&window, &projects)?;
    tauri::async_runtime::spawn_blocking(move || read_history(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}
