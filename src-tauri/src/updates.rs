use crate::locale;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, time::Duration};
use tauri::{AppHandle, Manager, State, ipc::Channel};
use tauri_plugin_http::reqwest::{Client, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Defaults {
    updates: UpdateConfig,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateConfig {
    repository: String,
}
#[derive(Deserialize, Serialize)]
struct SavedSettings {
    repository: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettings {
    repository: String,
    current_version: String,
}
#[derive(Default)]
pub struct PendingUpdate(pub tauri::async_runtime::Mutex<Option<Update>>);
#[derive(Deserialize)]
struct Release {
    tag_name: String,
    body: Option<String>,
    assets: Vec<Asset>,
}
#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current_version: String,
    version: Option<String>,
    notes: Option<String>,
    available: bool,
    installable: bool,
    notice: Option<String>,
    release_url: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    phase: &'static str,
    downloaded: u64,
    total: Option<u64>,
}

fn defaults() -> Defaults {
    serde_json::from_str(include_str!("../../settings.json")).expect("invalid bundled settings")
}
fn failure(key: &str, error: impl std::fmt::Display) -> String {
    locale::format(key, &[("p1", error.to_string())])
}
fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| failure("upd26", e))?
        .join("update-settings.json"))
}

// Only repository roots on GitHub are accepted; API paths are constructed locally.
fn repository_url(value: &str) -> Result<String, String> {
    let invalid = || locale::text("upd18").to_string();
    let url = Url::parse(value.trim()).map_err(|_| invalid())?;
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(invalid());
    }
    let segments: Vec<_> = url.path().trim_matches('/').split('/').collect();
    if segments.len() != 2 {
        return Err(invalid());
    }
    let owner = segments[0];
    let repo = segments[1].strip_suffix(".git").unwrap_or(segments[1]);
    if [owner, repo].iter().any(|part| {
        part.is_empty()
            || *part == "."
            || *part == ".."
            || !part
                .bytes()
                .all(|ch| ch.is_ascii_alphanumeric() || b"-_.".contains(&ch))
    }) {
        return Err(invalid());
    }
    Ok(format!("https://github.com/{owner}/{repo}"))
}
fn read_repository(app: &AppHandle) -> Result<String, String> {
    let path = settings_path(app)?;
    let repository = match std::fs::read(path) {
        Ok(bytes) => {
            serde_json::from_slice::<SavedSettings>(&bytes)
                .map_err(|e| failure("upd26", e))?
                .repository
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => defaults().updates.repository,
        Err(e) => return Err(failure("upd26", e)),
    };
    repository_url(&repository)
}
fn save_repository(app: &AppHandle, repository: &str) -> Result<(), String> {
    let path = settings_path(app)?;
    std::fs::create_dir_all(path.parent().expect("settings parent"))
        .map_err(|e| failure("upd20", e))?;
    let bytes = serde_json::to_vec_pretty(&SavedSettings {
        repository: repository.into(),
    })
    .map_err(|e| failure("upd20", e))?;
    std::fs::write(path, bytes).map_err(|e| failure("upd20", e))
}
fn release_version(tag: &str) -> Result<Version, String> {
    Version::parse(tag.strip_prefix('v').unwrap_or(tag)).map_err(|_| locale::text("upd27").into())
}

#[tauri::command]
pub fn get_update_settings(app: AppHandle) -> Result<UpdateSettings, String> {
    Ok(UpdateSettings {
        repository: read_repository(&app)?,
        current_version: app.package_info().version.to_string(),
    })
}

#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    repository: String,
) -> Result<UpdateInfo, String> {
    let mut pending = pending.0.lock().await;
    *pending = None;
    let repository = repository_url(&repository)?;
    save_repository(&app, &repository)?;
    let current = app.package_info().version.clone();
    let mut info = UpdateInfo {
        current_version: current.to_string(),
        version: None,
        notes: None,
        available: false,
        installable: false,
        notice: None,
        release_url: None,
    };
    let slug = repository
        .strip_prefix("https://github.com/")
        .expect("validated repository");
    let client = Client::builder()
        .user_agent(concat!("git-ui/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| failure("upd19", e))?;
    let response = client
        .get(format!(
            "https://api.github.com/repos/{slug}/releases/latest"
        ))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| failure("upd19", e))?;
    if response.status().as_u16() == 404 {
        info.notice = Some(locale::text("upd15").into());
        return Ok(info);
    }
    let bytes = response
        .error_for_status()
        .map_err(|e| failure("upd19", e))?
        .bytes()
        .await
        .map_err(|e| failure("upd19", e))?;
    let release: Release = serde_json::from_slice(&bytes).map_err(|e| failure("upd19", e))?;
    let latest = release_version(&release.tag_name)?;
    info.version = Some(latest.to_string());
    info.notes = release.body;
    if latest <= current {
        return Ok(info);
    }
    info.available = true;
    // Construct links from the validated source, never from release body content.
    info.release_url = Some(format!("{repository}/releases/latest"));
    let Some(manifest) = release
        .assets
        .iter()
        .find(|asset| asset.name == "latest.json")
    else {
        info.notice = Some(locale::text("upd23").into());
        return Ok(info);
    };
    let update = app
        .updater_builder()
        .endpoints(vec![
            Url::parse(&manifest.browser_download_url).map_err(|e| failure("upd19", e))?,
        ])
        .map_err(|e| failure("upd19", e))?
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| failure("upd19", e))?
        .check()
        .await
        .map_err(|e| failure("upd19", e))?;
    match update {
        Some(update) if release_version(&update.version)? == latest => {
            if cfg!(debug_assertions) {
                info.notice = Some(locale::text("upd24").into());
            } else {
                info.installable = true;
                *pending = Some(update);
            }
        }
        Some(_) => return Err(locale::text("upd25").into()),
        None => info.notice = Some(locale::text("upd28").into()),
    }
    Ok(info)
}

#[tauri::command]
pub async fn install_app_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    on_progress: Channel<UpdateProgress>,
) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err(locale::text("upd24").into());
    }
    let mut pending = pending.0.lock().await;
    let update = pending
        .as_ref()
        .ok_or_else(|| locale::text("upd22").to_string())?;
    let mut downloaded = 0_u64;
    update
        .download_and_install(
            |chunk, total| {
                downloaded = downloaded.saturating_add(chunk as u64);
                let _ = on_progress.send(UpdateProgress {
                    phase: "downloading",
                    downloaded,
                    total,
                });
            },
            || {
                let _ = on_progress.send(UpdateProgress {
                    phase: "installing",
                    downloaded: 0,
                    total: None,
                });
            },
        )
        .await
        .map_err(|e| failure("upd21", e))?;
    *pending = None;
    let _ = on_progress.send(UpdateProgress {
        phase: "restarting",
        downloaded: 0,
        total: None,
    });
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_repository_roots_and_normalizes_clone_urls() {
        assert_eq!(
            repository_url(" https://github.com/ufocoder/git-ui.git/ ").unwrap(),
            "https://github.com/ufocoder/git-ui"
        );
        for value in [
            "http://github.com/a/b",
            "https://evil.test/a/b",
            "https://github.com/a/b/releases",
            "https://github.com/a/b?x=1",
            "https://user@github.com/a/b",
            "https://github.com/a/%2f",
            "https://github.com/a/",
        ] {
            assert!(repository_url(value).is_err(), "{value}");
        }
    }
    #[test]
    fn compares_release_versions_numerically() {
        assert!(release_version("v0.10.0").unwrap() > release_version("0.9.0").unwrap());
        assert!(release_version("v1.0.0-beta.1").unwrap() < release_version("v1.0.0").unwrap());
        assert!(release_version("latest").is_err());
    }
}
