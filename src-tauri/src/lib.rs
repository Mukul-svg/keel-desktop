mod db;
mod commands;
mod markdown;
mod gemini;
mod gdrive;
mod sync_engine;
mod error;

use db::{init_db, DbState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. Configure WebView2 memory-reduction browser arguments natively on Windows
    #[cfg(target_os = "windows")]
    {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--enable-low-end-device-mode --renderer-process-limit=2 --process-per-site"
        );
    }

    // Initialize Windows Credential Manager store for keyring-core
    keyring_core::set_default_store(
        windows_native_keyring_store::Store::new()
            .expect("Failed to initialize Windows Credential Manager store")
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = init_db(&handle).await.expect("Failed to initialize SQLite database");
                handle.manage(DbState { pool });
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Notebooks
            commands::get_notebooks,
            commands::create_notebook,
            commands::update_notebook,
            commands::delete_notebook,
            commands::update_notebook_order,
            // Notes
            commands::get_notes,
            commands::update_note_order,
            commands::get_note_content,
            commands::save_note,
            commands::delete_note,
            commands::move_note,
            commands::toggle_pin_note,
            commands::search_notes,
            commands::save_pasted_image,
            // Snapshots
            commands::create_snapshot,
            commands::get_snapshots,
            commands::restore_snapshot,
            // Backlinks
            commands::get_note_backlinks,
            // Tags
            commands::get_all_tags,
            commands::get_note_id_by_title,
            // Gemini API Key
            gemini::set_gemini_api_key,
            gemini::get_gemini_api_key_status,
            gemini::delete_gemini_api_key,
            gemini::stream_gemini_beautify,
            // Google Drive Cloud Sync
            gdrive::connect_google_drive,
            gdrive::disconnect_google_drive,
            gdrive::trigger_gdrive_sync,
            gdrive::resolve_gdrive_conflict,
            gdrive::get_sync_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


