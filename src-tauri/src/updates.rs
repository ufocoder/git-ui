use crate::locale;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf, time::Duration};
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
struct ManifestMetadata {
    version: String,
    notes: Option<String>,
    #[serde(default, rename = "notesLocalized")]
    notes_localized: BTreeMap<String, String>,
}
#[derive(Debug)]
struct ReleaseMetadata {
    version: Version,
    notes: Option<String>,
    notes_localized: BTreeMap<String, String>,
    manifest: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current_version: String,
    version: Option<String>,
    notes: Option<String>,
    notes_localized: BTreeMap<String, String>,
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
        .map_err(|e| failure("update.settings-error", e))?
        .join("update-settings.json"))
}

// Only repository roots on GitHub are accepted; release download paths are constructed locally.
fn repository_url(value: &str) -> Result<String, String> {
    let invalid = || locale::text("update.invalid-repo").to_string();
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
                .map_err(|e| failure("update.settings-error", e))?
                .repository
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => defaults().updates.repository,
        Err(e) => return Err(failure("update.settings-error", e)),
    };
    repository_url(&repository)
}
fn save_repository(app: &AppHandle, repository: &str) -> Result<(), String> {
    let path = settings_path(app)?;
    std::fs::create_dir_all(path.parent().expect("settings parent"))
        .map_err(|e| failure("update.save-error", e))?;
    let bytes = serde_json::to_vec_pretty(&SavedSettings {
        repository: repository.into(),
    })
    .map_err(|e| failure("update.save-error", e))?;
    std::fs::write(path, bytes).map_err(|e| failure("update.save-error", e))
}
fn release_version(tag: &str) -> Result<Version, String> {
    Version::parse(tag.strip_prefix('v').unwrap_or(tag))
        .map_err(|_| locale::text("update.invalid-version").into())
}

fn manifest_url(repository: &str) -> String {
    format!("{repository}/releases/latest/download/latest.json")
}

fn version_from_release_url(repository: &str, url: &Url) -> Result<Version, String> {
    let prefix = format!("{repository}/releases/tag/");
    let tag = url
        .as_str()
        .strip_prefix(&prefix)
        .ok_or_else(|| locale::text("update.invalid-version").to_owned())?;
    release_version(tag)
}

async fn read_release_metadata(
    client: &Client,
    repository: &str,
) -> Result<Option<ReleaseMetadata>, String> {
    let response = client
        .get(manifest_url(repository))
        .send()
        .await
        .map_err(|e| failure("update.check-error", e))?;
    if response.status().as_u16() == 404 {
        // Old releases may lack updater assets. Follow the public latest-release
        // redirect to retain manual updates without querying the REST API.
        let release = client
            .get(format!("{repository}/releases/latest"))
            .send()
            .await
            .map_err(|e| failure("update.check-error", e))?;
        if release.status().as_u16() == 404 {
            return Ok(None);
        }
        let release = release
            .error_for_status()
            .map_err(|e| failure("update.check-error", e))?;
        return Ok(Some(ReleaseMetadata {
            version: version_from_release_url(repository, release.url())?,
            notes: None,
            notes_localized: BTreeMap::new(),
            manifest: false,
        }));
    }
    let bytes = response
        .error_for_status()
        .map_err(|e| failure("update.check-error", e))?
        .bytes()
        .await
        .map_err(|e| failure("update.check-error", e))?;
    let metadata: ManifestMetadata =
        serde_json::from_slice(&bytes).map_err(|e| failure("update.check-error", e))?;
    Ok(Some(ReleaseMetadata {
        version: release_version(&metadata.version)?,
        notes: metadata.notes,
        notes_localized: metadata.notes_localized,
        manifest: true,
    }))
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
        notes_localized: BTreeMap::new(),
        available: false,
        installable: false,
        notice: None,
        release_url: None,
    };
    let client = Client::builder()
        .user_agent(concat!("git-ui/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| failure("update.check-error", e))?;
    let Some(release) = read_release_metadata(&client, &repository).await? else {
        info.notice = Some(locale::text("update.no-releases").into());
        return Ok(info);
    };
    let latest = release.version;
    info.version = Some(latest.to_string());
    info.notes = release.notes;
    info.notes_localized = release.notes_localized;
    if latest <= current {
        return Ok(info);
    }
    info.available = true;
    info.release_url = Some(format!("{repository}/releases/latest"));
    if !release.manifest {
        info.notice = Some(locale::text("update.missing-manifest").into());
        return Ok(info);
    }
    let update = app
        .updater_builder()
        .endpoints(vec![
            Url::parse(&manifest_url(&repository)).map_err(|e| failure("update.check-error", e))?,
        ])
        .map_err(|e| failure("update.check-error", e))?
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| failure("update.check-error", e))?
        .check()
        .await
        .map_err(|e| failure("update.check-error", e))?;
    match update {
        Some(update) if release_version(&update.version)? == latest => {
            if cfg!(debug_assertions) {
                info.notice = Some(locale::text("update.release-only").into());
            } else {
                info.installable = true;
                *pending = Some(update);
            }
        }
        Some(_) => return Err(locale::text("update.version-mismatch").into()),
        None => info.notice = Some(locale::text("update.unavailable").into()),
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
        return Err(locale::text("update.release-only").into());
    }
    let mut pending = pending.0.lock().await;
    let update = pending
        .as_ref()
        .ok_or_else(|| locale::text("update.check-first").to_string())?;
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
        .map_err(|e| failure("update.install-error", e))?;
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
    #[test]
    fn reads_localized_and_legacy_release_notes() {
        let localized: super::ManifestMetadata = serde_json::from_str(
            r#"{"version":"0.4.2","notes":"English","notesLocalized":{"en":"English","ru":"Русский","zh":"中文"}}"#,
        ).unwrap();
        assert_eq!(
            localized.notes_localized.get("ru").map(String::as_str),
            Some("Русский")
        );
        let legacy: super::ManifestMetadata =
            serde_json::from_str(r#"{"version":"0.4.1","notes":"Legacy"}"#).unwrap();
        assert!(legacy.notes_localized.is_empty());
        assert_eq!(legacy.notes.as_deref(), Some("Legacy"));
    }

    use super::*;
    struct MockResponse {
        path: &'static str,
        status: &'static str,
        redirect: Option<&'static str>,
        body: &'static str,
    }

    fn release_server(responses: Vec<MockResponse>) -> (String, std::thread::JoinHandle<()>) {
        use std::io::{BufRead, BufReader, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let server_origin = origin.clone();
        let server = std::thread::spawn(move || {
            for response in responses {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut request = String::new();
                reader.read_line(&mut request).unwrap();
                assert_eq!(request.split_whitespace().nth(1), Some(response.path));
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                        break;
                    }
                }
                let location = response
                    .redirect
                    .map(|path| format!("Location: {server_origin}{path}\r\n"))
                    .unwrap_or_default();
                write!(
                    stream,
                    "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n{}\r\n{}",
                    response.status,
                    response.body.len(),
                    location,
                    response.body
                )
                .unwrap();
            }
        });
        (format!("{origin}/owner/repo"), server)
    }

    fn test_client() -> Client {
        Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap()
    }

    #[test]
    fn reads_version_and_notes_from_public_release_asset_without_api() {
        let (repository, server) = release_server(vec![MockResponse {
            path: "/owner/repo/releases/latest/download/latest.json",
            status: "200 OK",
            redirect: None,
            body: r#"{"version":"0.3.99","notes":"Release notes","platforms":{}}"#,
        }]);
        let release =
            tauri::async_runtime::block_on(read_release_metadata(&test_client(), &repository))
                .unwrap()
                .unwrap();
        server.join().unwrap();
        assert_eq!(release.version, release_version("v0.3.99").unwrap());
        assert_eq!(release.notes.as_deref(), Some("Release notes"));
        assert!(release.manifest);
    }

    #[test]
    fn missing_manifest_uses_public_redirect_for_manual_updates() {
        let (repository, server) = release_server(vec![
            MockResponse {
                path: "/owner/repo/releases/latest/download/latest.json",
                status: "404 Not Found",
                redirect: None,
                body: "",
            },
            MockResponse {
                path: "/owner/repo/releases/latest",
                status: "302 Found",
                redirect: Some("/owner/repo/releases/tag/v0.3.99"),
                body: "",
            },
            MockResponse {
                path: "/owner/repo/releases/tag/v0.3.99",
                status: "200 OK",
                redirect: None,
                body: "release page",
            },
        ]);
        let release =
            tauri::async_runtime::block_on(read_release_metadata(&test_client(), &repository))
                .unwrap()
                .unwrap();
        server.join().unwrap();
        assert_eq!(release.version, release_version("0.3.99").unwrap());
        assert!(!release.manifest);
    }

    #[test]
    fn no_public_release_is_reported_without_querying_api() {
        let (repository, server) = release_server(vec![
            MockResponse {
                path: "/owner/repo/releases/latest/download/latest.json",
                status: "404 Not Found",
                redirect: None,
                body: "",
            },
            MockResponse {
                path: "/owner/repo/releases/latest",
                status: "404 Not Found",
                redirect: None,
                body: "",
            },
        ]);
        assert!(
            tauri::async_runtime::block_on(read_release_metadata(&test_client(), &repository))
                .unwrap()
                .is_none()
        );
        server.join().unwrap();
    }

    #[test]
    fn network_rejection_is_an_error_not_an_up_to_date_result() {
        let (repository, server) = release_server(vec![MockResponse {
            path: "/owner/repo/releases/latest/download/latest.json",
            status: "403 Forbidden",
            redirect: None,
            body: "Forbidden",
        }]);
        assert!(
            tauri::async_runtime::block_on(read_release_metadata(&test_client(), &repository))
                .unwrap_err()
                .contains("403")
        );
        server.join().unwrap();
    }

    #[test]
    fn fallback_version_must_come_from_the_selected_repository() {
        let repository = "https://github.com/owner/repo";
        assert!(
            version_from_release_url(
                repository,
                &Url::parse("https://evil.test/owner/repo/releases/tag/v1.0.0").unwrap()
            )
            .is_err()
        );
        assert!(
            version_from_release_url(
                repository,
                &Url::parse("https://github.com/other/repo/releases/tag/v1.0.0").unwrap()
            )
            .is_err()
        );
        assert!(
            version_from_release_url(
                repository,
                &Url::parse("https://github.com/owner/repo/releases/tag/not-a-version").unwrap()
            )
            .is_err()
        );
        assert_eq!(
            manifest_url(repository),
            "https://github.com/owner/repo/releases/latest/download/latest.json"
        );
    }

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
