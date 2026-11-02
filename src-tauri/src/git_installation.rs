use serde::Serialize;
use std::ffi::OsStr;

#[derive(Serialize)]
pub struct GitInstallation {
    available: bool,
    platform: &'static str,
}

fn available(program: impl AsRef<OsStr>) -> bool {
    crate::process::background(program)
        .arg("--version")
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map(|output| output.status.success() && output.stdout.starts_with(b"git version "))
        .unwrap_or(false)
}

#[tauri::command]
pub async fn get_git_installation() -> Result<GitInstallation, String> {
    tauri::async_runtime::spawn_blocking(|| GitInstallation {
        available: available("git"),
        platform: std::env::consts::OS,
    }).await.map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn missing_executable_is_unavailable() {
        assert!(!super::available(std::env::temp_dir().join("git-ui-missing-git-executable")));
    }

    #[test]
    fn installed_git_is_available() {
        assert!(super::available("git"));
    }
}
