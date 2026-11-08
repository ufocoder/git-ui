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
    let check = MenuItem::with_id(
        app,
        CHECK_UPDATES,
        locale::text("update.check"),
        true,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, SETTINGS, locale::text("settings.title"), true, None::<&str>)?;
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
