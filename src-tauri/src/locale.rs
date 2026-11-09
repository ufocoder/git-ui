use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, OnceLock,
};
use tauri::{AppHandle, Emitter, Manager};

static ENGLISH: AtomicBool = AtomicBool::new(false);
static SAVE_LOCK: Mutex<()> = Mutex::new(());
fn messages(english: bool) -> &'static serde_json::Value {
    static RU: OnceLock<serde_json::Value> = OnceLock::new();
    static EN: OnceLock<serde_json::Value> = OnceLock::new();
    if english {
        EN.get_or_init(|| {
            serde_json::from_str(include_str!("../../locales/en.json"))
                .expect("invalid locale dictionary")
        })
    } else {
        RU.get_or_init(|| {
            serde_json::from_str(include_str!("../../locales/ru.json"))
                .expect("invalid locale dictionary")
        })
    }
}
pub fn text(key: &str) -> &'static str {
    messages(ENGLISH.load(Ordering::Relaxed))[key].as_str().expect("unknown translation key")
}
pub(crate) fn matches_text(key: &str, message: &str) -> bool {
    [false, true].into_iter().any(|english| messages(english)[key].as_str() == Some(message))
}
fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("language.json"))
}
pub fn load(app: &AppHandle) {
    let language = settings_path(app)
        .ok()
        .and_then(|path| std::fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice::<String>(&bytes).ok());
    ENGLISH.store(language.as_deref() == Some("en"), Ordering::Relaxed);
}
#[tauri::command]
pub fn get_app_language() -> &'static str {
    if ENGLISH.load(Ordering::Relaxed) {
        "en"
    } else {
        "ru"
    }
}
#[tauri::command]
pub fn set_app_language(app: AppHandle, language: String) -> Result<(), String> {
    if !["ru", "en"].contains(&language.as_str()) {
        return Err(crate::locale::text("language.invalid").into());
    }
    let _lock = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    let path = settings_path(&app)?;
    std::fs::create_dir_all(path.parent().expect("language settings parent"))
        .and_then(|_| std::fs::write(&path, serde_json::to_vec(&language).expect("language JSON")))
        .map_err(|error| format("language.save-error", &[("error", error.to_string())]))?;
    ENGLISH.store(language == "en", Ordering::Relaxed);
    let _ = crate::update_menu::install(&app);
    // Notify every open WebView, including the updater.
    app.emit("language-changed", &language)
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn format(key: &str, parameters: &[(&str, String)]) -> String {
    let template = text(key);
    let mut result = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        result.push_str(&rest[..start]);
        let Some(end) = rest[start..].find('}') else {
            rest = &rest[start..];
            break;
        };
        let name = &rest[start + 1..start + end];
        if let Some((_, value)) = parameters.iter().find(|(key, _)| *key == name) {
            result.push_str(value);
        } else {
            result.push_str(&rest[start..=start + end]);
        }
        rest = &rest[start + end + 1..];
    }
    result.push_str(rest);
    result
}
