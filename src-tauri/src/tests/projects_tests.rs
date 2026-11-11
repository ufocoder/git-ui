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
