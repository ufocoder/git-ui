use crate::{git, locale, project_path, Projects};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};
use tauri::{State, WebviewWindow};

const KEYS: &[&str] = &[
    "user.name",
    "user.email",
    "init.defaultbranch",
    "pull.rebase",
    "fetch.prune",
    "push.autosetupremote",
    "core.autocrlf",
];
#[derive(Serialize)]
pub struct Settings {
    values: BTreeMap<String, String>,
    effective: BTreeMap<String, String>,
}
#[derive(Deserialize)]
pub struct Change {
    key: String,
    value: Option<String>,
}
fn scope_flag(scope: &str) -> Result<&'static str, String> {
    match scope {
        "local" => Ok("--local"),
        "global" => Ok("--global"),
        _ => Err(locale::text("cfg17").into()),
    }
}
fn parse(output: &str) -> BTreeMap<String, String> {
    output
        .split('\0')
        .filter_map(|entry| entry.split_once('\n'))
        .filter(|(key, _)| KEYS.contains(key))
        .map(|(key, value)| (key.into(), value.into()))
        .collect()
}
fn read(path: &Path, scope: &str) -> Result<Settings, String> {
    scope_flag(scope)?;
    let output = git(path, &["config", "--null", "--list", "--show-scope"])?;
    let mut selected = String::new();
    let mut all = String::new();
    let mut entries = output.split('\0');
    while let (Some(_level), Some(entry)) = (entries.next(), entries.next()) {
        all.push_str(entry);
        all.push('\0');
    }
    // Included files still contribute to effective settings, but edits target only
    // the selected config file, leaving shared include files untouched.
    let direct = git(
        path,
        &[
            "config",
            "--no-includes",
            "--null",
            "--list",
            "--show-scope",
        ],
    )?;
    let mut entries = direct.split('\0');
    while let (Some(level), Some(entry)) = (entries.next(), entries.next()) {
        if level == scope {
            selected.push_str(entry);
            selected.push('\0');
        }
    }
    Ok(Settings {
        values: parse(&selected),
        effective: parse(&all),
    })
}
fn validate(change: &Change) -> Result<(), String> {
    if !KEYS.contains(&change.key.as_str()) {
        return Err(locale::text("cfg17").into());
    }
    if let Some(value) = &change.value {
        let valid = !value.is_empty()
            && value.len() <= 1024
            && !value.chars().any(char::is_control)
            && match change.key.as_str() {
                "pull.rebase" => {
                    ["true", "false", "merges", "interactive"].contains(&value.as_str())
                }
                "fetch.prune" | "push.autosetupremote" => {
                    ["true", "false"].contains(&value.as_str())
                }
                "core.autocrlf" => ["true", "false", "input"].contains(&value.as_str()),
                "init.defaultbranch" => !value.starts_with('-') && !value.contains(' '),
                _ => true,
            };
        if !valid {
            return Err(locale::text("cfg17").into());
        }
    }
    Ok(())
}
#[tauri::command]
pub fn get_git_settings(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    scope: String,
) -> Result<Settings, String> {
    let path = project_path(&window, &projects)?;
    read(Path::new(&path), &scope)
}
#[tauri::command]
pub fn save_git_settings(
    window: WebviewWindow,
    projects: State<'_, Projects>,
    scope: String,
    changes: Vec<Change>,
) -> Result<Settings, String> {
    let path = project_path(&window, &projects)?;
    let path = Path::new(&path);
    save(path, &scope, changes)
}
fn save(path: &Path, scope: &str, changes: Vec<Change>) -> Result<Settings, String> {
    let flag = scope_flag(scope)?;
    for change in &changes {
        validate(change)?;
    }
    for change in &changes {
        if let Some(value) = &change.value {
            if change.key == "init.defaultbranch" {
                git(path, &["check-ref-format", "--branch", value])?;
            }
        }
    }
    let current = read(path, scope)?;
    for change in changes {
        match change.value {
            Some(value) => {
                git(
                    path,
                    &["config", flag, "--replace-all", &change.key, &value],
                )?;
            }
            None if current.values.contains_key(&change.key) => {
                git(path, &["config", flag, "--unset-all", &change.key])?;
            }
            None => {}
        }
    }
    read(path, scope)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_settings_round_trip_and_reset() {
        let path = std::env::temp_dir().join(format!(
            "git-ui-settings-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&path).unwrap();
        git(&path, &["init"]).unwrap();
        let values = save(
            &path,
            "local",
            vec![
                Change {
                    key: "user.name".into(),
                    value: Some("Test Author".into()),
                },
                Change {
                    key: "fetch.prune".into(),
                    value: Some("true".into()),
                },
            ],
        )
        .unwrap();
        assert_eq!(values.values["user.name"], "Test Author");
        assert_eq!(values.effective["user.name"], "Test Author");
        let reset = save(
            &path,
            "local",
            vec![Change {
                key: "user.name".into(),
                value: None,
            }],
        )
        .unwrap();
        assert!(!reset.values.contains_key("user.name"));
        assert_eq!(reset.values["fetch.prune"], "true");
        let included = path.join("shared.config");
        std::fs::write(&included, "[user]\nname = Included Author\n").unwrap();
        git(
            &path,
            &[
                "config",
                "--local",
                "include.path",
                included.to_str().unwrap(),
            ],
        )
        .unwrap();
        let inherited = read(&path, "local").unwrap();
        assert!(!inherited.values.contains_key("user.name"));
        assert_eq!(inherited.effective["user.name"], "Included Author");
        save(
            &path,
            "local",
            vec![Change {
                key: "user.name".into(),
                value: None,
            }],
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(included).unwrap(),
            "[user]\nname = Included Author\n"
        );
        std::fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn rejects_unknown_keys_and_invalid_values() {
        for (key, value) in [
            ("core.hooksPath", "x"),
            ("pull.rebase", "bad"),
            ("user.name", "a\nb"),
            ("fetch.prune", "yes"),
        ] {
            assert!(validate(&Change {
                key: key.into(),
                value: Some(value.into())
            })
            .is_err());
        }
        assert!(validate(&Change {
            key: "user.email".into(),
            value: None
        })
        .is_ok());
    }
    #[test]
    fn parses_multivalues_and_filters_keys() {
        let values = parse("user.name\nFirst\0user.name\nLast\0core.hookspath\nx\0");
        assert_eq!(values.len(), 1);
        assert_eq!(values["user.name"], "Last");
    }
}
