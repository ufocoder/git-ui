use super::*;

#[test]
fn rejects_folder_without_git() {
    let repo = TempRepo::new();
    assert!(read_history(&repo.0).unwrap_err().contains(".git"));
}

#[test]
fn recent_projects_persist_are_unique_and_keep_five_latest() {
    let folder = TempRepo::new();
    let file = folder.0.join("settings/recent-projects.json");
    assert!(load_recent(&file).unwrap().is_empty());
    for n in 0..7 {
        save_recent(&file, format!("/project/{n}")).unwrap();
    }
    assert_eq!(
        load_recent(&file).unwrap(),
        vec![
            "/project/6",
            "/project/5",
            "/project/4",
            "/project/3",
            "/project/2"
        ]
    );
    save_recent(&file, "/project/4".into()).unwrap();
    assert_eq!(
        load_recent(&file).unwrap(),
        vec![
            "/project/4",
            "/project/6",
            "/project/5",
            "/project/3",
            "/project/2"
        ]
    );
}

#[test]
fn initializes_selected_folder_without_changing_its_files() {
    let repo = TempRepo::new();
    std::fs::write(repo.0.join("existing.txt"), "keep me").unwrap();
    assert!(can_initialize_repository(&repo.0).unwrap());
    initialize_repository(&repo.0).unwrap();
    assert!(repo.0.join(".git").is_dir());
    assert_eq!(
        std::fs::read_to_string(repo.0.join("existing.txt")).unwrap(),
        "keep me"
    );
    assert!(read_history(&repo.0).unwrap().commits.is_empty());
    assert!(!can_initialize_repository(&repo.0).unwrap());
    assert!(initialize_repository(&repo.0).is_err());
}

#[test]
fn terminal_log_preserves_last_operation_and_reports_failures() {
    let repo = TempRepo::new();
    repo.init();
    let initial = terminal_log::latest(&repo.0).unwrap().unwrap();
    assert_eq!(initial.status, "success");
    assert_eq!(initial.command, "git init");
    read_history(&repo.0).unwrap();
    assert_eq!(
        terminal_log::latest(&repo.0).unwrap().unwrap().id,
        initial.id
    );
    assert!(git(&repo.0, &["switch", "missing-branch"]).is_err());
    let failed = terminal_log::latest(&repo.0).unwrap().unwrap();
    assert_eq!(failed.status, "error");
    assert!(!failed.output.is_empty());
    read_history(&repo.0).unwrap();
    assert_eq!(
        terminal_log::latest(&repo.0).unwrap().unwrap().id,
        failed.id
    );
}

#[test]
fn missing_recent_project_is_removed_only_when_folder_is_absent() {
    use crate::projects::{project_folder_exists, remove_missing_recent};
    let folder = TempRepo::new();
    let file = folder.0.join("settings/recent-projects.json");
    let existing = folder.0.to_string_lossy().to_string();
    let missing = folder.0.join("missing").to_string_lossy().to_string();
    save_recent(&file, existing.clone()).unwrap();
    save_recent(&file, missing.clone()).unwrap();
    assert!(!project_folder_exists(Path::new(&missing)).unwrap());
    assert!(project_folder_exists(Path::new(&existing)).unwrap());
    assert_eq!(remove_missing_recent(&file, &existing).unwrap().len(), 2);
    assert_eq!(remove_missing_recent(&file, &missing).unwrap(), vec![existing.clone()]);
    assert!(Path::new(&existing).is_dir());
    assert_eq!(load_recent(&file).unwrap(), vec![existing]);
}

#[test]
fn recent_projects_deduplicate_filesystem_aliases_before_limiting() {
    let folder = TempRepo::new();
    let file = folder.0.join("recent-projects.json");
    let original = folder.0.to_string_lossy().to_string();
    let alias = folder.0.join(".").to_string_lossy().to_string();
    let canonical = folder.0.canonicalize().unwrap().to_string_lossy().to_string();
    std::fs::write(&file, serde_json::to_vec(&vec![&original, &alias, &canonical, "/missing-project"]).unwrap()).unwrap();
    assert_eq!(load_recent(&file).unwrap(), vec![original, "/missing-project".into()]);
    save_recent(&file, canonical.clone()).unwrap();
    assert_eq!(load_recent(&file).unwrap(), vec![canonical, "/missing-project".into()]);
}
