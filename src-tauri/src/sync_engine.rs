use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use sqlx::{sqlite::SqlitePool, Row};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use crate::db::DbState;
use crate::error::AppError;
use crate::gdrive::{
    get_valid_access_token, list_drive_files, download_drive_file,
    upload_drive_file, delete_drive_file, log_debug
};
use std::sync::OnceLock;
use tokio::sync::Mutex;

static SYNC_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncNotebook {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub description: Option<String>,
    pub is_pinned: bool,
    pub created_at: String,
    pub updated_at: String,
    pub sort_order: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncNoteDocument {
    pub id: String,
    pub notebook_id: Option<String>,
    pub title: String,
    pub is_pinned: bool,
    pub word_count: i32,
    pub char_count: i32,
    pub reading_time: i32,
    pub created_at: String,
    pub updated_at: String,
    pub sort_order: i32,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncConflictPayload {
    pub note_id: String,
    pub note_title: String,
    pub local_content: String,
    pub remote_content: String,
    pub remote_file_id: String,
    pub remote_updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type", content = "data")]
pub enum SyncResult {
    Success { synced_count: usize },
    Conflict(SyncConflictPayload),
    Error(String),
}

/// Helper: Update index, backlinks, and tags of a downloaded note
async fn rebuild_note_indices(
    note_id: &str,
    content: &str,
    pool: &SqlitePool,
) -> Result<(), AppError> {
    crate::commands::update_backlinks_internal(note_id, content, pool).await?;
    crate::commands::update_inline_tags_internal(note_id, content, pool).await?;
    Ok(())
}

/// Scans the markdown text for referenced sibling image assets and synchronizes them bi-directionally
async fn sync_referenced_images(
    app: &AppHandle,
    access_token: &str,
    content: &str,
    remote_file_map: &mut HashMap<String, crate::gdrive::DriveFile>,
) -> Result<(), AppError> {
    // Sibling assets directory: AppData/Local/com.keel.app/notebooks/assets/
    let app_dir = app.path().app_data_dir()?;
    let notebooks_root = app_dir.join("notebooks");
    let assets_dir = notebooks_root.join("assets");

    // Scan for relative link pattern: `../assets/img-`
    let mut images = Vec::new();
    let mut remaining = content;

    while let Some(start_idx) = remaining.find("../assets/img-") {
        let after_start = &remaining[start_idx..];
        // The image filename ends at the closing parenthesis `)` or a space/quote/newline
        if let Some(end_idx) = after_start.chars().position(|c| c == ')' || c == '"' || c == '\'' || c == ' ' || c == '\n') {
            let relative_path = &after_start[..end_idx];
            if let Some(filename) = relative_path.strip_prefix("../assets/") {
                if filename.starts_with("img-") {
                    images.push(filename.to_string());
                }
            }
            remaining = &after_start[end_idx..];
        } else {
            remaining = &after_start[14..]; // Skip "../assets/img-"
        }
    }

    for filename in images {
        let remote_name = format!("asset_{}", filename);
        let local_path = assets_dir.join(&filename);

        // A. Handle LOCAL → CLOUD (Upload)
        // If image exists locally, but not in cloud, upload it!
        let has_remote = remote_file_map.contains_key(&remote_name);
        if local_path.exists() && !has_remote {
            log_debug(app, &format!("Sync: Image asset {} is local-only. Uploading to Drive...", filename));
            
            // Read raw binary bytes
            let bytes = fs::read(&local_path)?;
            
            // Resolve MIME Type based on extension
            let mime_type = match local_path.extension().and_then(|e| e.to_str()) {
                Some("png") => "image/png",
                Some("jpg") | Some("jpeg") => "image/jpeg",
                Some("gif") => "image/gif",
                Some("webp") => "image/webp",
                _ => "application/octet-stream",
            };

            match crate::gdrive::upload_drive_file_bytes(
                access_token,
                &remote_name,
                &bytes,
                mime_type,
                None,
            ).await {
                Ok(file_id) => {
                    log_debug(app, &format!("Sync: Successfully uploaded image asset {}", filename));
                    // Insert into remote map so we don't try to upload it again during this cycle
                    remote_file_map.insert(remote_name.clone(), crate::gdrive::DriveFile {
                        id: file_id,
                        name: remote_name.clone(),
                        modifiedTime: None,
                        md5Checksum: None,
                    });
                }
                Err(e) => {
                    log_debug(app, &format!("Sync: Failed to upload image asset {}: {}", filename, e));
                }
            }
        }

        // B. Handle CLOUD → LOCAL (Download)
        // If image is missing locally, but exists in the cloud, download it!
        if !local_path.exists() {
            if let Some(r_file) = remote_file_map.get(&remote_name) {
                log_debug(app, &format!("Sync: Image asset {} is missing locally. Downloading from Drive...", filename));
                
                // Ensure sibling assets folder exists
                fs::create_dir_all(&assets_dir)?;

                match crate::gdrive::download_drive_file_bytes(access_token, &r_file.id).await {
                    Ok(bytes) => {
                        fs::write(&local_path, &bytes)?;
                        log_debug(app, &format!("Sync: Successfully downloaded image asset {}", filename));
                    }
                    Err(e) => {
                        log_debug(app, &format!("Sync: Failed to download image asset {}: {}", filename, e));
                    }
                }
            }
        }
    }

    Ok(())
}

/// Helper: Steps through SQLite tombstones and deletes respective Google Drive files
async fn propagate_tombstones(
    pool: &SqlitePool,
    access_token: &str,
    remote_file_map: &mut HashMap<String, crate::gdrive::DriveFile>,
    app: &AppHandle,
) -> Result<(), AppError> {
    log_debug(app, "--- Step 0: Propagating Local Deletions (Tombstones) ---");
    let local_tombstones = sqlx::query("SELECT id, item_type, deleted_at FROM tombstones")
        .fetch_all(pool)
        .await?;

    for row in local_tombstones {
        let ts_id: String = row.get("id");
        let item_type: String = row.get("item_type");
        
        let remote_name = if item_type == "note" {
            format!("note_{}.json", ts_id)
        } else {
            continue; // Notebook deletions are naturally handled in the notebooks.json sync
        };

        if let Some(r_file) = remote_file_map.remove(&remote_name) {
            log_debug(app, &format!("Tombstone matched remote file: {}. Deleting in cloud...", remote_name));
            if let Err(err) = delete_drive_file(access_token, &r_file.id).await {
                log_debug(app, &format!("Failed to delete tombstoned remote file {}: {}", remote_name, err));
            }
        }

        // Garbage collect local tombstone since it is now propagated or remote is clean
        sqlx::query("DELETE FROM tombstones WHERE id = ?")
            .bind(&ts_id)
            .execute(pool)
            .await?;
    }
    Ok(())
}

/// Helper: Performs notebook merging, database synchronization, local directory creation, and remote upload
async fn sync_notebooks(
    app: &AppHandle,
    pool: &SqlitePool,
    access_token: &str,
    remote_file_map: &mut HashMap<String, crate::gdrive::DriveFile>,
    notebooks_root: &std::path::Path,
) -> Result<(), AppError> {
    log_debug(app, "--- Step 1: Synchronizing Notebooks ---");

    // 1A. Fetch local notebooks
    let local_notebooks_query = sqlx::query(
        "SELECT id, name, emoji, description, folder_path, is_pinned, created_at, updated_at, sort_order FROM notebooks"
    )
    .fetch_all(pool)
    .await?;

    let mut local_notebooks_map: HashMap<String, SyncNotebook> = HashMap::new();
    for row in &local_notebooks_query {
        let id: String = row.get("id");
        local_notebooks_map.insert(id.clone(), SyncNotebook {
            id,
            name: row.get("name"),
            emoji: row.get("emoji"),
            description: row.get("description"),
            is_pinned: row.get::<i32, _>("is_pinned") == 1,
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            sort_order: row.get("sort_order"),
        });
    }

    // 1B. Fetch/merge remote notebooks list
    let mut remote_notebooks: Vec<SyncNotebook> = Vec::new();
    let notebooks_file_name = "notebooks.json";
    let mut remote_notebooks_file_id: Option<String> = None;
    
    if let Some(remote_notebooks_file) = remote_file_map.remove(notebooks_file_name) {
        remote_notebooks_file_id = Some(remote_notebooks_file.id.clone());
        log_debug(app, "Downloading remote notebooks.json...");
        // Download existing remote notebooks list
        let content = download_drive_file(access_token, &remote_notebooks_file.id).await.map_err(AppError::Generic)?;
        if let Ok(list) = serde_json::from_str::<Vec<SyncNotebook>>(&content) {
            log_debug(app, &format!("Found {} notebooks in remote", list.len()));
            remote_notebooks = list;
        }
    } else {
        log_debug(app, "No remote notebooks.json found - will create new one");
    }

    let mut merged_notebooks: HashMap<String, SyncNotebook> = HashMap::new();
    let mut notebooks_changed = false;

    // Add all remote notebooks to merged list, creating directories/DB entries if missing locally
    for r_nb in remote_notebooks {
        // CHECK: If notebook has a local tombstone, skip it (meaning it was deleted locally)
        let has_tombstone = sqlx::query("SELECT 1 FROM tombstones WHERE id = ?")
            .bind(&r_nb.id)
            .fetch_optional(pool)
            .await?
            .is_some();
        if has_tombstone {
            notebooks_changed = true;
            continue;
        }

        if let Some(l_nb) = local_notebooks_map.get(&r_nb.id) {
            // Exists in both: compare updated_at
            if r_nb.updated_at > l_nb.updated_at {
                // Remote is newer: update local SQLite database
                sqlx::query(
                    "UPDATE notebooks SET name = ?, emoji = ?, description = ?, is_pinned = ?, updated_at = ?, sort_order = ? WHERE id = ?"
                )
                .bind(&r_nb.name)
                .bind(&r_nb.emoji)
                .bind(&r_nb.description)
                .bind(if r_nb.is_pinned { 1 } else { 0 })
                .bind(&r_nb.updated_at)
                .bind(r_nb.sort_order)
                .bind(&r_nb.id)
                .execute(pool)
                .await?;
                
                merged_notebooks.insert(r_nb.id.clone(), r_nb);
                notebooks_changed = true;
            } else {
                // Local is newer or equal: use local details
                merged_notebooks.insert(l_nb.id.clone(), l_nb.clone());
            }
        } else {
            // Exists remotely but missing locally: Create folder & register in DB
            let physical_folder = notebooks_root.join(&r_nb.name);
            fs::create_dir_all(&physical_folder)?;
            
            sqlx::query(
                "INSERT INTO notebooks (id, name, emoji, description, folder_path, is_pinned, created_at, updated_at, sort_order) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(&r_nb.id)
            .bind(&r_nb.name)
            .bind(&r_nb.emoji)
            .bind(&r_nb.description)
            .bind(physical_folder.to_string_lossy().to_string())
            .bind(if r_nb.is_pinned { 1 } else { 0 })
            .bind(&r_nb.created_at)
            .bind(&r_nb.updated_at)
            .bind(r_nb.sort_order)
            .execute(pool)
            .await?;

            merged_notebooks.insert(r_nb.id.clone(), r_nb);
            notebooks_changed = true;
        }
    }

    // Add local notebooks that are not yet in Drive AppData
    for (id, l_nb) in &local_notebooks_map {
        if !merged_notebooks.contains_key(id) {
            merged_notebooks.insert(id.clone(), l_nb.clone());
            notebooks_changed = true;
        }
    }

    // Upload merged notebooks list back to Drive AppData folder if there were changes
    if notebooks_changed || !notebooks_root.exists() {
        let merged_list: Vec<SyncNotebook> = merged_notebooks.values().cloned().collect();
        let serialized_list = serde_json::to_string_pretty(&merged_list)?;
        
        log_debug(app, &format!("Uploading notebooks.json with {} notebooks...", merged_list.len()));
        upload_drive_file(
            access_token,
            notebooks_file_name,
            &serialized_list,
            remote_notebooks_file_id.as_deref(),
        ).await.map_err(AppError::Generic)?;
        log_debug(app, "Notebooks synced successfully");

        // Garbage collect notebook tombstones since they are now propagated to notebooks.json in GDrive
        sqlx::query("DELETE FROM tombstones WHERE item_type = 'notebook'")
            .execute(pool)
            .await?;
    } else {
        log_debug(app, "No notebook changes to sync");
    }

    Ok(())
}

/// Helper: Handles Obsidian-style non-blocking sidecar note creation during conflicts
async fn create_conflict_sidecar_note(
    app: &AppHandle,
    pool: &SqlitePool,
    note_id: &str,
    title: &str,
    local_path: &std::path::Path,
    remote_doc: &SyncNoteDocument,
    app_dir: &std::path::Path,
) -> Result<(), AppError> {
    log_debug(app, &format!("Conflict detected in note '{}'. Creating Obsidian-style non-blocking conflict sidecar note...", title));
    
    let conflict_id = uuid::Uuid::new_v4().to_string();
    let conflict_title = format!("{} (Cloud Conflict)", title);
    let conflict_md_name = format!("{}.md", conflict_id);
    let conflict_path = local_path.parent()
        .unwrap_or(app_dir)
        .join(&conflict_md_name);
    
    let mut tx = pool.begin().await?;

    // 1. Write physical Markdown file for conflict copy
    fs::write(&conflict_path, &remote_doc.content)?;

    // 2. Compute metrics for conflict copy
    let r_word_count = remote_doc.content.split_whitespace().count() as i32;
    let r_char_count = remote_doc.content.chars().count() as i32;
    let r_reading_time = std::cmp::max(1, (r_word_count as f32 / 3.0) as i32);
    let now_utc = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    // 3. Insert conflict copy note record in local SQLite
    let conflict_path_str = conflict_path.to_string_lossy().to_string();
    sqlx::query(
        "INSERT INTO notes (id, notebook_id, title, file_path, is_pinned, word_count, char_count, reading_time, created_at, updated_at, sort_order) 
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&conflict_id)
    .bind(&remote_doc.notebook_id)
    .bind(&conflict_title)
    .bind(&conflict_path_str)
    .bind(r_word_count)
    .bind(r_char_count)
    .bind(r_reading_time)
    .bind(&remote_doc.created_at)
    .bind(&now_utc)
    .bind(remote_doc.sort_order)
    .execute(&mut *tx)
    .await?;

    // 4. Insert FTS Search index for conflict copy
    sqlx::query("INSERT INTO notes_fts (id, title, content) VALUES (?, ?, ?)")
        .bind(&conflict_id)
        .bind(&conflict_title)
        .bind(&remote_doc.content)
        .execute(&mut *tx)
        .await?;

    // 5. Align original local note timestamp so it doesn't re-trigger conflict next cycle
    sqlx::query("UPDATE notes SET updated_at = ? WHERE id = ?")
        .bind(&now_utc)
        .bind(note_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    // 6. Rebuild backlinks/tags indices for the conflict copy
    rebuild_note_indices(&conflict_id, &remote_doc.content, pool).await?;

    log_debug(app, &format!("Obsidian-style conflict copy '{}' created successfully", conflict_title));
    Ok(())
}

/// Helper: Uploads local note edits to Google Drive AppData
async fn upload_local_note(
    app: &AppHandle,
    access_token: &str,
    note_id: &str,
    notebook_id: &Option<String>,
    title: &str,
    is_pinned: bool,
    word_count: i32,
    char_count: i32,
    reading_time: i32,
    created_at: &str,
    updated_at: &str,
    sort_order: i32,
    local_content: &str,
    remote_name: &str,
    remote_file_id: Option<&str>,
) -> Result<(), AppError> {
    log_debug(app, &format!("Uploading local note '{}' (newer than remote/new)...", title));
    let sync_doc = SyncNoteDocument {
        id: note_id.to_string(),
        notebook_id: notebook_id.clone(),
        title: title.to_string(),
        is_pinned,
        word_count,
        char_count,
        reading_time,
        created_at: created_at.to_string(),
        updated_at: updated_at.to_string(),
        sort_order,
        content: local_content.to_string(),
    };
    let serialized = serde_json::to_string_pretty(&sync_doc)?;
    upload_drive_file(access_token, remote_name, &serialized, remote_file_id).await.map_err(AppError::Generic)?;
    log_debug(app, &format!("Successfully uploaded note '{}'", title));
    Ok(())
}

/// Helper: Downloads and applies remote edits locally within a SQL Transaction
async fn download_and_apply_remote_note(
    app: &AppHandle,
    pool: &SqlitePool,
    note_id: &str,
    title: &str,
    local_path: &std::path::Path,
    destination_path: &std::path::Path,
    remote_doc: &SyncNoteDocument,
) -> Result<(), AppError> {
    log_debug(app, &format!("Downloading remote note '{}' (newer than local)...", title));
    
    let mut tx = pool.begin().await?;

    // Relocate physical Markdown file and clean up old path
    if local_path.exists() && local_path != destination_path {
        log_debug(app, &format!("Note '{}' has moved notebooks remotely. Relocating physical file...", title));
        let _ = fs::remove_file(local_path);
    }

    fs::write(destination_path, &remote_doc.content)?;

    let destination_path_str = destination_path.to_string_lossy().to_string();
    sqlx::query(
        "UPDATE notes SET notebook_id = ?, title = ?, file_path = ?, is_pinned = ?, word_count = ?, char_count = ?, reading_time = ?, updated_at = ?, sort_order = ? WHERE id = ?"
    )
    .bind(&remote_doc.notebook_id)
    .bind(&remote_doc.title)
    .bind(&destination_path_str)
    .bind(if remote_doc.is_pinned { 1 } else { 0 })
    .bind(remote_doc.word_count)
    .bind(remote_doc.char_count)
    .bind(remote_doc.reading_time)
    .bind(&remote_doc.updated_at)
    .bind(remote_doc.sort_order)
    .bind(note_id)
    .execute(&mut *tx)
    .await?;

    // Update FTS Index
    sqlx::query("DELETE FROM notes_fts WHERE id = ?")
        .bind(note_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("INSERT INTO notes_fts(id, title, content) VALUES (?, ?, ?)")
        .bind(note_id)
        .bind(&remote_doc.title)
        .bind(&remote_doc.content)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    rebuild_note_indices(note_id, &remote_doc.content, pool).await?;
    Ok(())
}

/// Executes the core bidirectional synchronization cycle with thread concurrency locking
pub async fn execute_sync_cycle(
    app: &AppHandle,
    _last_sync_time_param: Option<String>,
) -> SyncResult {
    log_debug(app, "=== Starting Google Drive Sync Cycle ===");

    // 1. Thread Concurrency Mutex Lock
    let mutex = SYNC_MUTEX.get_or_init(|| Mutex::new(()));
    let _guard = match mutex.try_lock() {
        Ok(guard) => guard,
        Err(_) => {
            let msg = "Synchronization is already active in another thread.".to_string();
            log_debug(app, &msg);
            return SyncResult::Error(msg);
        }
    };

    // 2. Resolve Access Token
    let access_token = match get_valid_access_token().await {
        Ok(tok) => tok,
        Err(e) => {
            log_debug(app, &format!("Sync failed - authentication error: {}", e));
            return SyncResult::Error(format!("Authentication failed: {}", e));
        }
    };
    log_debug(app, "Access token retrieved successfully");

    match run_sync_cycle_internal(app, &access_token).await {
        Ok(res) => res,
        Err(e) => {
            log_debug(app, &format!("Google Drive Sync failed: {}", e));
            SyncResult::Error(e.to_string())
        }
    }
}

/// Inner helper carrying out the database and network operations in a Result block
async fn run_sync_cycle_internal(
    app: &AppHandle,
    access_token: &str,
) -> Result<SyncResult, AppError> {
    let state = app.state::<DbState>();
    let pool = &state.pool;

    // A. Retrieve last_sync_time anchor directly from the SQLite sync_metadata table
    let db_sync_row = sqlx::query("SELECT value FROM sync_metadata WHERE key = 'last_sync_time'")
        .fetch_optional(pool)
        .await?;
    let last_sync_time: Option<String> = db_sync_row.map(|r| r.get("value"));
    log_debug(app, &format!("Retrieved sync anchor from SQLite: {:?}", last_sync_time));

    // B. Fetch all files inside the Google Drive AppData folder
    log_debug(app, "Fetching remote files from Google Drive AppData folder...");
    let remote_files = list_drive_files(access_token).await.map_err(AppError::Generic)?;
    log_debug(app, &format!("Found {} remote files in Drive", remote_files.len()));

    // Index remote files by name for O(1) lookups
    let mut remote_file_map: HashMap<String, crate::gdrive::DriveFile> = remote_files
        .into_iter()
        .map(|f| (f.name.clone(), f))
        .collect();

    // =========================================================================
    // STEP 0: PROPAGATE LOCAL DELETIONS (TOMBSTONES) TO GOOGLE DRIVE
    // =========================================================================
    propagate_tombstones(pool, access_token, &mut remote_file_map, app).await?;

    // =========================================================================
    // STEP 1: NOTEBOOKS SYNCHRONIZATION
    // =========================================================================
    let app_dir = app.path().app_data_dir()?;
    let notebooks_root = app_dir.join("notebooks");
    sync_notebooks(app, pool, access_token, &mut remote_file_map, &notebooks_root).await?;

    // =========================================================================
    // STEP 2: NOTES SYNCHRONIZATION
    // =========================================================================
    log_debug(app, "--- Step 2: Synchronizing Notes ---");
    // 2A. Fetch all local notes
    let local_notes_query = sqlx::query(
        "SELECT id, notebook_id, title, file_path, is_pinned, word_count, char_count, reading_time, created_at, updated_at, sort_order FROM notes"
    )
    .fetch_all(pool)
    .await?;

    let mut local_notes_map: HashMap<String, (String, Option<String>, String, bool, i32, i32, i32, String, String, i32)> = HashMap::new();
    for row in &local_notes_query {
        let id: String = row.get("id");
        let notebook_id: Option<String> = row.get("notebook_id");
        let title: String = row.get("title");
        let is_pinned: bool = row.get::<i32, _>("is_pinned") == 1;
        let word_count: i32 = row.get("word_count");
        let char_count: i32 = row.get("char_count");
        let reading_time: i32 = row.get("reading_time");
        let created_at: String = row.get("created_at");
        let updated_at: String = row.get("updated_at");
        let sort_order: i32 = row.get("sort_order");
        
        local_notes_map.insert(id.clone(), (
            id, notebook_id, title, is_pinned, word_count, char_count, reading_time, created_at, updated_at, sort_order
        ));
    }

    let mut synced_count = 0;

    // 2B. Process notes
    // Iterate local notes and check if they exist remotely
    for (note_id, (_id, notebook_id, title, is_pinned, word_count, char_count, reading_time, created_at, updated_at, sort_order)) in &local_notes_map {
        let remote_name = format!("note_{}.json", note_id);

        // Concurrency / Race Condition Guard: Re-fetch latest updated_at from the database.
        let db_row = sqlx::query("SELECT updated_at FROM notes WHERE id = ?")
            .bind(note_id)
            .fetch_optional(pool)
            .await?;
        if let Some(row) = db_row {
            let current_updated_at: String = row.get("updated_at");
            if current_updated_at != *updated_at {
                log_debug(app, &format!("Note '{}' was modified locally during sync. Skipping to protect active edits.", title));
                // Remove from remote_file_map so step 2C does not treat it as a remote-only note!
                remote_file_map.remove(&remote_name);
                continue;
            }
        } else {
            // Note was deleted locally since sync started, skip and remove from remote map to avoid resurrection
            remote_file_map.remove(&remote_name);
            continue;
        }
        
        // Read local physical content
        let file_path_str = match local_notes_query.iter().find(|r| r.get::<String, _>("id") == *note_id) {
            Some(row) => row.get::<String, _>("file_path"),
            None => continue,
        };
        let local_path = PathBuf::from(&file_path_str);
        let local_content = fs::read_to_string(&local_path).unwrap_or_default();

        if let Some(r_file) = remote_file_map.remove(&remote_name) {
            // --- EXISTS IN BOTH: COMPARE TIMESTAMPS & DETECT CONFLICTS ---
            // Download remote JSON to get detailed metadata and content
            let remote_doc_content = download_drive_file(access_token, &r_file.id).await.map_err(AppError::Generic)?;

            let remote_doc: SyncNoteDocument = match serde_json::from_str(&remote_doc_content) {
                Ok(doc) => doc,
                Err(_) => continue, // Corrupt remote file, skip
            };

            if updated_at == &remote_doc.updated_at {
                // In perfect sync, skip
                continue;
            }

            // Check if contents are identical
            if local_content == remote_doc.content {
                // If content is identical but timestamps differed, align them locally inside SQLite and skip
                sqlx::query("UPDATE notes SET updated_at = ? WHERE id = ?")
                    .bind(&remote_doc.updated_at)
                    .bind(note_id)
                    .execute(pool)
                    .await?;
                continue;
            }

            // DETECT SYNC CONFLICT
            let is_local_newer_than_last_sync = match &last_sync_time {
                Some(t) => {
                    let local_dt = chrono::DateTime::parse_from_rfc3339(updated_at).map(|dt| dt.with_timezone(&chrono::Utc));
                    let last_dt = chrono::DateTime::parse_from_rfc3339(t).map(|dt| dt.with_timezone(&chrono::Utc));
                    match (local_dt, last_dt) {
                        (Ok(l), Ok(s)) => l > s,
                        _ => updated_at > t,
                    }
                },
                None => true,
            };
            let is_remote_newer_than_last_sync = match &last_sync_time {
                Some(t) => {
                    let remote_dt = chrono::DateTime::parse_from_rfc3339(&remote_doc.updated_at).map(|dt| dt.with_timezone(&chrono::Utc));
                    let last_dt = chrono::DateTime::parse_from_rfc3339(t).map(|dt| dt.with_timezone(&chrono::Utc));
                    match (remote_dt, last_dt) {
                        (Ok(r), Ok(s)) => r > s,
                        _ => &remote_doc.updated_at > t,
                    }
                },
                None => true,
            };

            if is_local_newer_than_last_sync && is_remote_newer_than_last_sync {
                create_conflict_sidecar_note(app, pool, note_id, title, &local_path, &remote_doc, &app_dir).await?;
                synced_count += 1;
                continue;
            }

            // Otherwise, simple update:
            if updated_at > &remote_doc.updated_at {
                // Local is newer: Upload to Drive
                upload_local_note(
                    app,
                    access_token,
                    note_id,
                    notebook_id,
                    title,
                    *is_pinned,
                    *word_count,
                    *char_count,
                    *reading_time,
                    created_at,
                    updated_at,
                    *sort_order,
                    &local_content,
                    &remote_name,
                    Some(&r_file.id),
                ).await?;
                
                // Sync referenced image assets bi-directionally
                let _ = sync_referenced_images(app, access_token, &local_content, &mut remote_file_map).await;

                synced_count += 1;
            } else {
                // Remote is newer: Download and apply locally
                let remote_nb_id = remote_doc.notebook_id.clone().unwrap_or_else(|| "inbox".to_string());
                let notebook_row = sqlx::query("SELECT folder_path FROM notebooks WHERE id = ?")
                    .bind(&remote_nb_id)
                    .fetch_optional(pool)
                    .await?;
                let notebook_folder = match notebook_row {
                    Some(row) => row.get::<String, _>("folder_path"),
                    None => {
                        let inbox_row = sqlx::query("SELECT folder_path FROM notebooks WHERE id = 'inbox'")
                            .fetch_one(pool)
                            .await?;
                        inbox_row.get::<String, _>("folder_path")
                    }
                };

                let note_md_name = format!("{}.md", remote_doc.id);
                let destination_path = PathBuf::from(&notebook_folder).join(&note_md_name);

                download_and_apply_remote_note(app, pool, note_id, title, &local_path, &destination_path, &remote_doc).await?;
                
                // Sync referenced image assets bi-directionally
                let _ = sync_referenced_images(app, access_token, &remote_doc.content, &mut remote_file_map).await;

                synced_count += 1;
            }
        } else {
            // --- ONLY EXISTS LOCALLY or DELETED REMOTELY ---
            let is_previously_synced = match &last_sync_time {
                Some(t) => created_at < t,
                None => false,
            };

            if is_previously_synced {
                log_debug(app, &format!("Note '{}' was deleted remotely. Applying local deletion...", title));
                
                let mut tx = pool.begin().await?;
                
                if local_path.exists() {
                    let _ = fs::remove_file(&local_path);
                }

                sqlx::query("DELETE FROM notes WHERE id = ?").bind(note_id).execute(&mut *tx).await?;
                sqlx::query("DELETE FROM notes_fts WHERE id = ?").bind(note_id).execute(&mut *tx).await?;
                sqlx::query("DELETE FROM backlinks WHERE source_note_id = ?").bind(note_id).execute(&mut *tx).await?;
                sqlx::query("DELETE FROM note_tags WHERE note_id = ?").bind(note_id).execute(&mut *tx).await?;
                
                tx.commit().await?;
                synced_count += 1;
            } else {
                upload_local_note(
                    app,
                    access_token,
                    note_id,
                    notebook_id,
                    title,
                    *is_pinned,
                    *word_count,
                    *char_count,
                    *reading_time,
                    created_at,
                    updated_at,
                    *sort_order,
                    &local_content,
                    &remote_name,
                    None,
                ).await?;
                
                // Sync referenced image assets bi-directionally
                let _ = sync_referenced_images(app, access_token, &local_content, &mut remote_file_map).await;

                synced_count += 1;
            }
        }
    }

    // 2C. Process remaining remote files that DO NOT exist locally
    log_debug(app, "Checking for remote-only notes to download...");
    for (file_name, r_file) in remote_file_map.clone() {
        if !file_name.starts_with("note_") || !file_name.ends_with(".json") {
            continue;
        }

        let remote_id = file_name.replace("note_", "").replace(".json", "");

        // Tombstone cross-reference check
        let has_local_tombstone = sqlx::query("SELECT 1 FROM tombstones WHERE id = ?")
            .bind(&remote_id)
            .fetch_optional(pool)
            .await?
            .is_some();

        if has_local_tombstone {
            log_debug(app, &format!("Remote-only note {} has a local deletion log. Propagating delete to GDrive...", remote_id));
            if let Err(err) = delete_drive_file(access_token, &r_file.id).await {
                log_debug(app, &format!("Failed to delete tombstoned cloud file {}: {}", file_name, err));
            }
            // Garbage collect local tombstone
            sqlx::query("DELETE FROM tombstones WHERE id = ?").bind(&remote_id).execute(pool).await?;
            continue;
        }

        let remote_doc_content = download_drive_file(access_token, &r_file.id).await.map_err(AppError::Generic)?;
        let remote_doc: SyncNoteDocument = match serde_json::from_str(&remote_doc_content) {
            Ok(doc) => doc,
            Err(_) => continue,
        };

        // Resolve destination local path
        let notebook_id = remote_doc.notebook_id.clone().unwrap_or_else(|| "inbox".to_string());
        
        let notebook_row = sqlx::query("SELECT folder_path FROM notebooks WHERE id = ?")
            .bind(&notebook_id)
            .fetch_optional(pool)
            .await?;

        let notebook_folder = match notebook_row {
            Some(row) => row.get::<String, _>("folder_path"),
            None => {
                let inbox_row = sqlx::query("SELECT folder_path FROM notebooks WHERE id = 'inbox'")
                    .fetch_one(pool)
                    .await?;
                inbox_row.get::<String, _>("folder_path")
            }
        };

        let note_md_name = format!("{}.md", remote_doc.id);
        let destination_path = PathBuf::from(&notebook_folder).join(&note_md_name);

        let mut tx = pool.begin().await?;

        // Write physical Markdown file
        fs::write(&destination_path, &remote_doc.content)?;

        // Insert metadata in local SQLite
        let destination_path_str = destination_path.to_string_lossy().to_string();
        sqlx::query(
            "INSERT INTO notes (id, notebook_id, title, file_path, is_pinned, word_count, char_count, reading_time, created_at, updated_at, sort_order) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&remote_doc.id)
        .bind(&remote_doc.notebook_id)
        .bind(&remote_doc.title)
        .bind(&destination_path_str)
        .bind(if remote_doc.is_pinned { 1 } else { 0 })
        .bind(remote_doc.word_count)
        .bind(remote_doc.char_count)
        .bind(remote_doc.reading_time)
        .bind(&remote_doc.created_at)
        .bind(&remote_doc.updated_at)
        .bind(remote_doc.sort_order)
        .execute(&mut *tx)
        .await?;

        // Insert FTS Search index
        sqlx::query("INSERT INTO notes_fts (id, title, content) VALUES (?, ?, ?)")
            .bind(&remote_doc.id)
            .bind(&remote_doc.title)
            .bind(&remote_doc.content)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;

        // Compute backlinks and tags
        rebuild_note_indices(&remote_doc.id, &remote_doc.content, pool).await?;
        
        // Sync referenced image assets bi-directionally
        let _ = sync_referenced_images(app, access_token, &remote_doc.content, &mut remote_file_map).await;

        log_debug(app, &format!("Downloaded remote-only note '{}'", remote_doc.title));
        synced_count += 1;
    }

    // D. Persist standard UTC RFC 3339 last_sync_time success timestamp in database
    let now_utc = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    sqlx::query(
        "INSERT INTO sync_metadata (key, value) VALUES ('last_sync_time', ?) 
         ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .bind(&now_utc)
    .execute(pool)
    .await?;

    log_debug(app, &format!("=== Sync Complete: {} notes synced. DB Anchor: {} ===", synced_count, now_utc));
    Ok(SyncResult::Success { synced_count })
}

/// Applies the selected conflict resolution strategy standardising timestamps to standard UTC strings
pub async fn resolve_gdrive_conflict_strategy(
    app: &AppHandle,
    note_id: String,
    strategy: String,
) -> Result<(), AppError> {
    let access_token = get_valid_access_token().await.map_err(AppError::Generic)?;

    let state = app.state::<DbState>();
    let pool = &state.pool;

    // Get note details
    let note_row = sqlx::query("SELECT file_path, notebook_id, title, is_pinned, word_count, char_count, reading_time, created_at, updated_at, sort_order FROM notes WHERE id = ?")
        .bind(&note_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::Generic("Local note not found".to_string()))?;

    let file_path_str: String = note_row.get("file_path");
    let local_path = PathBuf::from(&file_path_str);
    let local_content = fs::read_to_string(&local_path).unwrap_or_default();

    // Query Google Drive for the existing file details to update it
    let remote_files = list_drive_files(&access_token).await.map_err(AppError::Generic)?;
    let remote_name = format!("note_{}.json", note_id);
    let r_file = remote_files.iter().find(|f| f.name == remote_name)
        .ok_or_else(|| AppError::Generic("Remote note file not found in Google Drive".to_string()))?;

    let remote_doc_content = download_drive_file(&access_token, &r_file.id).await.map_err(AppError::Generic)?;
    let remote_doc: SyncNoteDocument = serde_json::from_str(&remote_doc_content)?;

    let current_time = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    match strategy.as_str() {
        "local" => {
            // Upload local version to Drive (overwriting remote)
            let sync_doc = SyncNoteDocument {
                id: note_id.clone(),
                notebook_id: note_row.get("notebook_id"),
                title: note_row.get("title"),
                is_pinned: note_row.get::<i32, _>("is_pinned") == 1,
                word_count: note_row.get("word_count"),
                char_count: note_row.get("char_count"),
                reading_time: note_row.get("reading_time"),
                created_at: note_row.get("created_at"),
                updated_at: current_time.clone(),
                sort_order: note_row.get("sort_order"),
                content: local_content,
            };
            
            // Update local SQLite timestamp
            sqlx::query("UPDATE notes SET updated_at = ? WHERE id = ?")
                .bind(&current_time)
                .bind(&note_id)
                .execute(pool)
                .await?;

            let serialized = serde_json::to_string_pretty(&sync_doc)?;
            upload_drive_file(&access_token, &remote_name, &serialized, Some(&r_file.id)).await.map_err(AppError::Generic)?;
        }
        "remote" => {
            // Apply remote version locally (overwriting local) in a SQL transaction
            let mut tx = pool.begin().await?;

            fs::write(&local_path, &remote_doc.content)?;
            
            sqlx::query(
                "UPDATE notes SET notebook_id = ?, title = ?, is_pinned = ?, word_count = ?, char_count = ?, reading_time = ?, updated_at = ?, sort_order = ? WHERE id = ?"
            )
            .bind(&remote_doc.notebook_id)
            .bind(&remote_doc.title)
            .bind(if remote_doc.is_pinned { 1 } else { 0 })
            .bind(remote_doc.word_count)
            .bind(remote_doc.char_count)
            .bind(remote_doc.reading_time)
            .bind(&remote_doc.updated_at)
            .bind(remote_doc.sort_order)
            .bind(&note_id)
            .execute(&mut *tx)
            .await?;

            // Re-index FTS
            sqlx::query("DELETE FROM notes_fts WHERE id = ?")
                .bind(&note_id)
                .execute(&mut *tx)
                .await?;

            sqlx::query("INSERT INTO notes_fts(id, title, content) VALUES (?, ?, ?)")
                .bind(&note_id)
                .bind(&remote_doc.title)
                .bind(&remote_doc.content)
                .execute(&mut *tx)
                .await?;

            tx.commit().await?;

            rebuild_note_indices(&note_id, &remote_doc.content, pool).await?;
        }
        "merge" => {
            // Merge both contents
            let merged_content = format!(
                "{}\n\n=== Merged Cloud Changes ===\n{}",
                local_content,
                remote_doc.content.replace(&local_content, "").trim()
            );

            let mut tx = pool.begin().await?;

            // Write physically
            fs::write(&local_path, &merged_content)?;
            
            // Recalculate metrics
            let word_count = merged_content.split_whitespace().count() as i32;
            let char_count = merged_content.chars().count() as i32;
            let reading_time = std::cmp::max(1, (word_count as f32 / 3.0) as i32);

            let sync_doc = SyncNoteDocument {
                id: note_id.clone(),
                notebook_id: note_row.get("notebook_id"),
                title: note_row.get("title"),
                is_pinned: note_row.get::<i32, _>("is_pinned") == 1,
                word_count,
                char_count,
                reading_time,
                created_at: note_row.get("created_at"),
                updated_at: current_time.clone(),
                sort_order: note_row.get("sort_order"),
                content: merged_content.clone(),
            };

            // Update local SQLite
            sqlx::query(
                "UPDATE notes SET word_count = ?, char_count = ?, reading_time = ?, updated_at = ? WHERE id = ?"
            )
            .bind(word_count)
            .bind(char_count)
            .bind(reading_time)
            .bind(&current_time)
            .bind(&note_id)
            .execute(&mut *tx)
            .await?;

            // Re-index FTS
            sqlx::query("DELETE FROM notes_fts WHERE id = ?")
                .bind(&note_id)
                .execute(&mut *tx)
                .await?;

            sqlx::query("INSERT INTO notes_fts(id, title, content) VALUES (?, ?, ?)")
                .bind(&note_id)
                .bind(note_row.get::<String, _>("title"))
                .bind(&merged_content)
                .execute(&mut *tx)
                .await?;

            tx.commit().await?;

            rebuild_note_indices(&note_id, &merged_content, pool).await?;

            // Upload merged file to Google Drive AppData
            let serialized = serde_json::to_string_pretty(&sync_doc)?;
            upload_drive_file(&access_token, &remote_name, &serialized, Some(&r_file.id)).await.map_err(AppError::Generic)?;
        }
        _ => return Err(AppError::Generic("Invalid resolution strategy".to_string())),
    }

    Ok(())
}
