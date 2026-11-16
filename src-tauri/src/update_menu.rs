use crate::locale;
use tauri::{
    menu::{Menu, MenuItem},
    AppHandle, Emitter, Manager,
};

pub const SETTINGS: &str = "open-settings";
pub const CHECK_UPDATES: &str = "check-updates";
pub const KEYBOARD_SHORTCUTS: &str = "keyboard-shortcuts";

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    #[cfg(target_os = "macos")]
    localize_macos_menu(&menu, &app.package_info().name)?;
    let check = MenuItem::with_id(
        app,
        CHECK_UPDATES,
        locale::text("update.check"),
        true,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(
        app,
        SETTINGS,
        locale::text("settings.title"),
        true,
        None::<&str>,
    )?;
    #[cfg(target_os = "macos")]
    if let Some(submenu) = menu
        .items()?
        .first()
        .and_then(|item| item.as_submenu())
        .cloned()
    {
        submenu.insert(&settings, 1)?;
        submenu.insert(&check, 2)?;
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(submenu) = menu
        .get(tauri::menu::HELP_SUBMENU_ID)
        .and_then(|item| item.as_submenu().cloned())
    {
        submenu.append(&settings)?;
        submenu.append(&check)?;
    }
    let shortcuts = MenuItem::with_id(
        app,
        KEYBOARD_SHORTCUTS,
        locale::text("shortcuts.title"),
        true,
        None::<&str>,
    )?;
    if let Some(help) = menu
        .get(tauri::menu::HELP_SUBMENU_ID)
        .and_then(|item| item.as_submenu().cloned())
    {
        help.append(&shortcuts)?;
    }
    app.set_menu(menu)?;
    #[cfg(windows)]
    if let Some(window) = app.get_webview_window("main") {
        let has_project = app
            .try_state::<crate::Projects>()
            .is_some_and(|projects| crate::project_path(&window, &projects).is_ok());
        if !has_project {
            window.hide_menu()?;
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn localize_macos_menu<R: tauri::Runtime>(menu: &Menu<R>, app_name: &str) -> tauri::Result<()> {
    // Match the default macOS menu layout before inserting application actions.
    let labels: [(Option<&str>, &[(usize, &str)]); 6] = [
        (
            None,
            &[
                (0, locale::text("menu.about")),
                (2, locale::text("menu.services")),
                (4, locale::text("menu.hide")),
                (5, locale::text("menu.hide-others")),
                (7, locale::text("menu.quit")),
            ],
        ),
        (
            Some(locale::text("menu.file")),
            &[(0, locale::text("menu.close"))],
        ),
        (
            Some(locale::text("menu.edit")),
            &[
                (0, locale::text("menu.undo")),
                (1, locale::text("menu.redo")),
                (3, locale::text("menu.cut")),
                (4, locale::text("menu.copy")),
                (5, locale::text("menu.paste")),
                (6, locale::text("menu.select-all")),
            ],
        ),
        (
            Some(locale::text("menu.view")),
            &[(0, locale::text("menu.fullscreen"))],
        ),
        (
            Some(locale::text("menu.window")),
            &[
                (0, locale::text("menu.minimize")),
                (1, locale::text("menu.maximize")),
                (3, locale::text("menu.close")),
            ],
        ),
        (Some(locale::text("menu.help")), &[]),
    ];
    for (item, (title, labels)) in menu.items()?.iter().zip(labels) {
        let Some(submenu) = item.as_submenu() else {
            continue;
        };
        if let Some(title) = title {
            submenu.set_text(title)?;
        }
        let items = submenu.items()?;
        for &(index, label) in labels {
            if let Some(item) = items
                .get(index)
                .and_then(|item| item.as_predefined_menuitem())
            {
                item.set_text(label.replace("{app}", app_name))?;
            }
        }
    }
    Ok(())
}

pub fn show(app: &AppHandle) -> tauri::Result<()> {
    show_dialog(app, CHECK_UPDATES)
}

pub fn show_dialog(app: &AppHandle, event: &str) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.emit(event, ())?;
        window.unminimize()?;
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}
