use crate::locale;
use tauri::{
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
    menu::{Menu, MenuItem},
};

pub const CHECK_UPDATES: &str = "check-updates";

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    let check = MenuItem::with_id(
        app,
        CHECK_UPDATES,
        locale::text("upd01"),
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
        submenu.insert(&check, 1)?;
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(submenu) = menu
        .get(tauri::menu::HELP_SUBMENU_ID)
        .and_then(|item| item.as_submenu().cloned())
    {
        submenu.append(&check)?;
    }
    app.set_menu(menu)?;
    Ok(())
}

pub fn show(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("updates") {
        window.unminimize()?;
        window.show()?;
        return window.set_focus();
    }
    WebviewWindowBuilder::new(
        app,
        "updates",
        WebviewUrl::App("index.html?view=updates".into()),
    )
    .title(locale::text("upd02"))
    .visible(false)
    .inner_size(600., 360.)
    .resizable(true)
    .center()
    .build()?;
    Ok(())
}
