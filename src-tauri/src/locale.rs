use std::sync::{
    atomic::{AtomicU8, Ordering},
    Mutex, OnceLock,
};
use tauri::{AppHandle, Emitter, Manager};

static LANGUAGE: AtomicU8 = AtomicU8::new(0);
static SAVE_LOCK: Mutex<()> = Mutex::new(());
fn language_index(language: &str) -> u8 {
    match language {
        "en" => 1,
        "zh" => 2,
        _ => 0,
    }
}
fn messages(language: u8) -> &'static serde_json::Value {
    static RU: OnceLock<serde_json::Value> = OnceLock::new();
    static EN: OnceLock<serde_json::Value> = OnceLock::new();
    static ZH: OnceLock<serde_json::Value> = OnceLock::new();
    let (dictionary, source) = match language {
        1 => (&EN, include_str!("../../locales/en.json")),
        2 => (&ZH, include_str!("../../locales/zh.json")),
        _ => (&RU, include_str!("../../locales/ru.json")),
    };
    dictionary.get_or_init(|| serde_json::from_str(source).expect("invalid locale dictionary"))
}
pub fn text(key: &str) -> &'static str {
    messages(LANGUAGE.load(Ordering::Relaxed))[key]
        .as_str()
        .expect("unknown translation key")
}
pub(crate) fn matches_text(key: &str, message: &str) -> bool {
    [0, 1, 2]
        .into_iter()
        .any(|language| messages(language)[key].as_str() == Some(message))
}
fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("language.json"))
}
fn read_language(path: &std::path::Path) -> Option<String> {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<String>(&bytes).ok())
        .filter(|value| matches!(value.as_str(), "ru" | "en" | "zh"))
}

fn write_language(path: &std::path::Path, language: &str) -> Result<(), String> {
    std::fs::create_dir_all(path.parent().expect("language settings parent"))
        .and_then(|_| std::fs::write(path, serde_json::to_vec(language).expect("language JSON")))
        .map_err(|error| format("language.save-error", &[("error", error.to_string())]))
}

pub fn load(app: &AppHandle) {
    let language = settings_path(app).ok().and_then(|path| read_language(&path));
    LANGUAGE.store(language_index(language.as_deref().unwrap_or("ru")), Ordering::Relaxed);
}

#[tauri::command]
pub fn get_app_language(app: AppHandle, preferred_language: Option<String>) -> String {
    let _lock = SAVE_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let path = settings_path(&app).ok();
    if let Some(saved) = path.as_deref().and_then(read_language) {
        return saved;
    }
    let language = match preferred_language.as_deref() {
        Some("en") => "en",
        Some("zh") => "zh",
        _ => "ru",
    };
    let next = language_index(language);
    let changed = LANGUAGE.swap(next, Ordering::Relaxed) != next;
    if let Some(path) = path {
        if let Err(error) = write_language(&path, language) {
            eprintln!("{error}");
        }
    }
    if changed {
        let _ = crate::update_menu::install(&app);
    }
    language.into()
}

#[tauri::command]
pub fn set_app_language(app: AppHandle, language: String) -> Result<(), String> {
    if !["ru", "en", "zh"].contains(&language.as_str()) {
        return Err(crate::locale::text("language.invalid").into());
    }
    let _lock = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    write_language(&settings_path(&app)?, &language)?;
    LANGUAGE.store(language_index(&language), Ordering::Relaxed);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chinese_dictionary_is_selectable() {
        assert_eq!(
            messages(language_index("zh"))["commit.create"].as_str(),
            Some("创建提交")
        );
        assert_eq!(
            messages(language_index("en"))["commit.create"].as_str(),
            Some("Create commit")
        );
        assert!(messages(language_index("ru"))["commit.create"]
            .as_str()
            .is_some());
        assert_eq!(language_index("fr"), 0);
        assert_eq!(messages(0), messages(language_index("fr")));
    }

    #[test]
    fn matches_text_recognizes_chinese_and_english() {
        let key = "error.git-lfs-missing";
        assert!(matches_text(key, messages(1)[key].as_str().unwrap()));
        assert!(matches_text(key, messages(2)[key].as_str().unwrap()));
        assert!(!matches_text(key, "unrelated message"));
    }

    #[test]
    fn read_language_roundtrip() {
        let path = std::env::temp_dir().join(format!(
            "git-ui-locale-test-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert_eq!(read_language(&path), None);
        write_language(&path, "zh").unwrap();
        assert_eq!(read_language(&path), Some("zh".into()));
        write_language(&path, "en").unwrap();
        assert_eq!(read_language(&path), Some("en".into()));
        write_language(&path, "fr").unwrap();
        assert_eq!(read_language(&path), None);
        std::fs::remove_file(&path).unwrap();
    }
}
