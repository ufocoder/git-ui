mod projects;
mod repository_operations;

use projects::{Projects, RecentProjects, project_path};
#[cfg(test)]
use repository_operations::sync_repository;

mod diffs;
mod git_command;
mod history;

use diffs::{
    CommitDetails, CommitFile, FileDiff, WORKTREE, commit_diff_args, read_commit_details,
    read_file_diff, read_worktree_files,
};
#[cfg(test)]
use diffs::{WorktreeDiffScope, read_commit_files, read_worktree_diff_scoped};
use git_command::{git, git_bytes};
use history::{
    BranchComparison, CommitPage, PAGE_SIZE, ProjectHistory, parse_commit_log, read_commit_range,
    read_history, read_remotes,
};
#[cfg(test)]
use history::{
    read_branch_commit_page, read_branch_commit_page_at_tips, read_branch_comparisons,
    read_commit_page,
};

mod branch_actions;
mod branch_comparisons;
mod commit_ops;
mod commit_options;
mod conflicts;
mod development_guard;
mod fetch_status;
mod file_actions;
mod git_installation;
mod git_settings;
mod history_search;
mod locale;
mod process;
mod reference_actions;
mod stash;
mod sync_status;
mod tags;
mod terminal_log;
mod tracking;
mod update_menu;
mod updates;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            locale::load(app.handle());
            update_menu::install(app.handle())?;
            if let Some(window) = app.get_webview_window("main") {
                if let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) {
                    let work_area = monitor.work_area();
                    let scale = window.scale_factor()?;
                    let inner = window.inner_size()?;
                    let outer = window.outer_size()?;
                    let frame_width = outer.width.saturating_sub(inner.width);
                    let frame_height = outer.height.saturating_sub(inner.height);
                    let width = ((960.0 * scale).round() as u32)
                        .min(work_area.size.width.saturating_sub(frame_width))
                        .max(1);
                    let height = ((720.0 * scale).round() as u32)
                        .min(work_area.size.height.saturating_sub(frame_height))
                        .max(1);
                    window.set_size(tauri::PhysicalSize::new(width, height))?;
                    window.set_position(tauri::PhysicalPosition::new(
                        work_area.position.x
                            + (work_area.size.width.saturating_sub(width + frame_width) / 2) as i32,
                        work_area.position.y
                            + (work_area.size.height.saturating_sub(height + frame_height) / 2)
                                as i32,
                    ))?;
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == update_menu::CHECK_UPDATES {
                if let Err(error) = update_menu::show(app) {
                    eprintln!("{error}");
                }
            } else if event.id().as_ref() == update_menu::SETTINGS {
                if let Err(error) = update_menu::show_dialog(app, update_menu::SETTINGS) {
                    eprintln!("{error}");
                }
            } else if event.id().as_ref() == update_menu::KEYBOARD_SHORTCUTS {
                if let Err(error) = update_menu::show_dialog(app, update_menu::KEYBOARD_SHORTCUTS) {
                    eprintln!("{error}");
                }
            }
        })
        .manage(updates::PendingUpdate::default())
        .manage(Projects::default())
        .manage(RecentProjects::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            file_actions::file_actions_platform,
            file_actions::preview_restore_path,
            file_actions::restore_project_path,
            file_actions::reveal_project_path,
            git_installation::get_git_installation,
            git_settings::get_git_settings,
            git_settings::save_git_settings,
            locale::get_app_language,
            locale::set_app_language,
            updates::get_update_settings,
            updates::check_app_update,
            updates::install_app_update,
            projects::open_project,
            projects::can_initialize_project,
            projects::initialize_project,
            projects::get_recent_projects,
            projects::get_project_history,
            projects::get_project_terminal_log,
            history::get_commit_page,
            stash::stash_project,
            stash::get_stash_details,
            stash::get_stash_diff,
            history_search::get_filtered_commit_page,
            history::get_sync_commit_page,
            diffs::get_commit_files,
            diffs::get_commit_details,
            diffs::get_file_diff,
            conflicts::get_conflict_file,
            conflicts::resolve_conflict_file,
            repository_operations::switch_project_branch,
            repository_operations::create_project_branch,
            repository_operations::create_project_branch_at_commit,
            repository_operations::create_project_tag,
            repository_operations::checkout_project_commit,
            repository_operations::reset_project_commit,
            repository_operations::create_project_tag_at_commit,
            repository_operations::set_project_file_staged,
            repository_operations::commit_project_changes,
            repository_operations::add_project_remote,
            projects::show_project_chooser,
            projects::frontend_ready,
            repository_operations::sync_project,
            commit_ops::run_commit_operation,
            branch_comparisons::get_branch_comparisons,
            branch_actions::preview_branch_action,
            branch_actions::execute_branch_action,
            reference_actions::change_project_reference,
            tags::push_project_tags,
            tags::delete_project_tag,
            tags::remote_project_tag_exists,
            tracking::publish_project_branch,
            tracking::set_project_upstream,
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<Projects>().remove(window.label());
            }
        })
        .run(tauri::generate_context!())
        .expect(locale::text("appErr"));
}

#[cfg(test)]
mod tests;
