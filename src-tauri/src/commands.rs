use crate::db::DbState;
use crate::error::AppError;
use crate::markdown::render_markdown;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePool, Row};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{Manager, State};
use uuid::Uuid;

// --- DTO Structs for IPC Serialization ---

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Notebook {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub description: Option<String>,
    pub folder_path: String,
    pub created_at: String,
    pub updated_at: String,
    pub sort_order: i32,
    pub is_pinned: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Note {
    pub id: String,
    pub notebook_id: Option<String>,
    pub title: String,
    pub file_path: String,
    pub is_pinned: bool,
    pub word_count: i32,
    pub char_count: i32,
    pub reading_time: i32,
    pub created_at: String,
    pub updated_at: String,
    pub sort_order: i32,
    pub content: Option<String>,
    pub content_html: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub snippet: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Tag {
    pub name: String,
    pub color_hex: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Snapshot {
    pub id: String,
    pub note_id: String,
    pub label: Option<String>,
    pub created_at: String,
}

// --- Notebook Commands ---

#[tauri::command]
pub async fn get_notebooks(state: State<'_, DbState>) -> Result<Vec<Notebook>, AppError> {
    let rows = sqlx::query(
        "SELECT id, name, emoji, description, folder_path, created_at, updated_at, sort_order, is_pinned 
         FROM notebooks 
         ORDER BY 
           CASE WHEN id = 'inbox' THEN 0 ELSE 1 END,
           is_pinned DESC,
           sort_order ASC,
           name ASC"
    )
    .fetch_all(&state.pool)
    .await?;

    let notebooks = rows
        .into_iter()
        .map(|row| {
            let is_pinned_int: i32 = row.get("is_pinned");
            Notebook {
                id: row.get("id"),
                name: row.get("name"),
                emoji: row.get("emoji"),
                description: row.get("description"),
                folder_path: row.get("folder_path"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                sort_order: row.get("sort_order"),
                is_pinned: is_pinned_int == 1,
            }
        })
        .collect();

    Ok(notebooks)
}

#[tauri::command]
pub async fn create_notebook(
    name: String,
    emoji: String,
    description: Option<String>,
    app_handle: tauri::AppHandle,
    state: State<'_, DbState>,
) -> Result<Notebook, AppError> {
    let id = Uuid::new_v4().to_string();
    
    // Resolve absolute path in AppData
    let app_dir = app_handle.path().app_data_dir()?;
    let folder_name = name.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-', "_");
    let folder_path = app_dir.join("notebooks").join(&folder_name);

    // Create physical folder
    fs::create_dir_all(&folder_path)?;

    let folder_path_str = folder_path.to_string_lossy().to_string();

    sqlx::query(
        "INSERT INTO notebooks (id, name, emoji, description, folder_path) 
         VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&name)
    .bind(&emoji)
    .bind(&description)
    .bind(&folder_path_str)
    .execute(&state.pool)
    .await?;

    Ok(Notebook {
        id,
        name,
        emoji,
        description,
        folder_path: folder_path_str,
        created_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        updated_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        sort_order: 0,
        is_pinned: false,
    })
}

#[tauri::command]
pub async fn update_notebook(
    id: String,
    name: String,
    emoji: String,
    description: Option<String>,
    is_pinned: bool,
    state: State<'_, DbState>,
) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE notebooks 
         SET name = ?, emoji = ?, description = ?, is_pinned = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?"
    )
    .bind(name)
    .bind(emoji)
    .bind(description)
    .bind(if is_pinned { 1 } else { 0 })
    .bind(id)
    .execute(&state.pool)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn delete_notebook(
    id: String,
    state: State<'_, DbState>,
) -> Result<(), AppError> {
    if id == "inbox" {
        return Err(AppError::Generic("The default Inbox notebook cannot be deleted.".to_string()));
    }

    let mut tx = state.pool.begin().await?;

    // 1. Get all notes under this notebook
    let notes = sqlx::query("SELECT id, file_path FROM notes WHERE notebook_id = ?")
        .bind(&id)
        .fetch_all(&mut *tx)
        .await?;

    let current_time = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    // 2. Delete physical markdown files and record tombstones for notes under this notebook
    for row in notes {
        let note_id: String = row.get("id");
        let file_path: String = row.get("file_path");
        let path = std::path::Path::new(&file_path);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
        
        // Log tombstone for note
        sqlx::query(
            "INSERT OR REPLACE INTO tombstones (id, item_type, deleted_at) VALUES (?, 'note', ?)"
        )
        .bind(&note_id)
        .bind(&current_time)
        .execute(&mut *tx)
        .await?;

        // Delete note from FTS index
        sqlx::query("DELETE FROM notes_fts WHERE id = ?")
            .bind(&note_id)
            .execute(&mut *tx)
            .await?;
    }

    // 3. Delete notes from DB
    sqlx::query("DELETE FROM notes WHERE notebook_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    // 4. Log tombstone for notebook
    sqlx::query(
        "INSERT OR REPLACE INTO tombstones (id, item_type, deleted_at) VALUES (?, 'notebook', ?)"
    )
    .bind(&id)
    .bind(&current_time)
    .execute(&mut *tx)
    .await?;

    // 5. Delete physical folder for the notebook
    let notebook_row = sqlx::query("SELECT folder_path FROM notebooks WHERE id = ?")
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?;

    if let Some(row) = notebook_row {
        let folder_path: String = row.get("folder_path");
        let path = std::path::Path::new(&folder_path);
        if path.exists() {
            let _ = std::fs::remove_dir_all(path);
        }
    }

    // 6. Delete notebook from DB
    sqlx::query("DELETE FROM notebooks WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn update_notebook_order(
    ordered_ids: Vec<String>,
    state: State<'_, DbState>,
) -> Result<(), AppError> {
    let mut tx = state.pool.begin().await?;

    for (index, id) in ordered_ids.iter().enumerate() {
        sqlx::query("UPDATE notebooks SET sort_order = ? WHERE id = ?")
            .bind(index as i32)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(())
}

// --- Note Commands ---

#[tauri::command]
pub async fn get_notes(notebook_id: String, state: State<'_, DbState>) -> Result<Vec<Note>, AppError> {
    let rows = sqlx::query(
        "SELECT id, notebook_id, title, file_path, is_pinned, word_count, char_count, reading_time, created_at, updated_at, sort_order 
         FROM notes WHERE notebook_id = ? ORDER BY is_pinned DESC, sort_order ASC, updated_at DESC"
    )
    .bind(notebook_id)
    .fetch_all(&state.pool)
    .await?;

    let notes = rows
        .into_iter()
        .map(|row| {
            let is_pinned_int: i32 = row.get("is_pinned");
            let file_path_str: String = row.get("file_path");

            // Read first 150 characters of markdown file for frontend note card preview
            let preview_content = fs::read_to_string(&file_path_str)
                .map(|content| {
                    let char_limit = 150;
                    if content.chars().count() > char_limit {
                        content.chars().take(char_limit).collect::<String>() + "..."
                    } else {
                        content
                    }
                })
                .ok();

            Note {
                id: row.get("id"),
                notebook_id: row.get("notebook_id"),
                title: row.get("title"),
                file_path: file_path_str,
                is_pinned: is_pinned_int == 1,
                word_count: row.get("word_count"),
                char_count: row.get("char_count"),
                reading_time: row.get("reading_time"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                sort_order: row.get("sort_order"),
                content: preview_content,
                content_html: None,
            }
        })
        .collect();

    Ok(notes)
}

#[tauri::command]
pub async fn update_note_order(
    ordered_ids: Vec<String>,
    state: State<'_, DbState>,
) -> Result<(), AppError> {
    let mut tx = state.pool.begin().await?;

    for (index, id) in ordered_ids.iter().enumerate() {
        sqlx::query("UPDATE notes SET sort_order = ? WHERE id = ?")
            .bind(index as i32)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(())
}

fn convert_file_src_rust(path: &str) -> String {
    // 1. Standardize Windows backslashes to forward slashes for a valid URL path
    let standardized_path = path.replace("\\", "/");
    
    // 2. Split by '/' and URL-encode each segment individually to keep slashes as URL dividers
    let segments: Vec<String> = standardized_path
        .split('/')
        .map(|segment| urlencoding::encode(segment).into_owned().replace("+", "%20"))
        .collect();
    
    let encoded = segments.join("/");

    #[cfg(target_os = "macos")]
    {
        format!("asset://localhost/{}", encoded)
    }
    #[cfg(not(target_os = "macos"))]
    {
        format!("http://asset.localhost/{}", encoded)
    }
}

#[tauri::command]
pub async fn get_note_content(
    id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, DbState>,
) -> Result<Note, AppError> {
    let row = sqlx::query(
        "SELECT id, notebook_id, title, file_path, is_pinned, word_count, char_count, reading_time, created_at, updated_at, sort_order 
         FROM notes WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::Generic("Note not found".to_string()))?;

    let file_path: String = row.get("file_path");
    let content = fs::read_to_string(&file_path)?;
    
    // Resolve absolute sibling assets folder inside AppData/notebooks/assets
    let app_dir = app_handle.path().app_data_dir()?;
    let assets_dir = app_dir.join("notebooks").join("assets");
    let assets_dir_str = assets_dir.to_string_lossy().to_string();
    let asset_url_base = convert_file_src_rust(&assets_dir_str);

    // Render markdown and translate relative sibling paths to secure local WebView asset protocol links
    let content_html = render_markdown(&content)
        .replace("src=\"../assets/", &format!("src=\"{}/", asset_url_base));

    let is_pinned_int: i32 = row.get("is_pinned");

    Ok(Note {
        id: row.get("id"),
        notebook_id: row.get("notebook_id"),
        title: row.get("title"),
        file_path,
        is_pinned: is_pinned_int == 1,
        word_count: row.get("word_count"),
        char_count: row.get("char_count"),
        reading_time: row.get("reading_time"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        sort_order: row.get("sort_order"),
        content: Some(content),
        content_html: Some(content_html),
    })
}

#[tauri::command]
pub async fn save_note(
    id: Option<String>,
    title: String,
    content: String,
    notebook_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, DbState>,
) -> Result<Note, AppError> {
    let note_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    
    // 1. Fetch notebook details to get physical destination
    let notebook_row = sqlx::query("SELECT folder_path FROM notebooks WHERE id = ?")
        .bind(&notebook_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::Generic("Notebook not found".to_string()))?;
    
    let notebook_folder: String = notebook_row.get("folder_path");
    let file_name = format!("{}.md", note_id);
    let new_file_path = PathBuf::from(&notebook_folder).join(&file_name);

    // 2. Perform file system changes
    // Check if the note already exists and has a different file path (if moved notebooks)
    let existing_note = sqlx::query("SELECT file_path FROM notes WHERE id = ?")
        .bind(&note_id)
        .fetch_optional(&state.pool)
        .await?;

    if let Some(row) = existing_note {
        let old_file_path_str: String = row.get("file_path");
        let old_file_path = PathBuf::from(&old_file_path_str);
        if old_file_path.exists() && old_file_path != new_file_path {
            let _ = fs::remove_file(&old_file_path);
        }
    }

    // Write content to new location
    fs::write(&new_file_path, &content)?;

    // 3. Compute Metrics
    let word_count = content.split_whitespace().count() as i32;
    let char_count = content.chars().count() as i32;
    let reading_time = std::cmp::max(1, (word_count as f32 / 3.0) as i32); // Estimate ~180 words/min (3 words/sec)

    // 4. Save metadata to DB
    let new_file_path_str = new_file_path.to_string_lossy().to_string();
    let current_time = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    sqlx::query(
        "INSERT INTO notes (id, notebook_id, title, file_path, word_count, char_count, reading_time, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET 
            notebook_id = excluded.notebook_id,
            title = excluded.title,
            file_path = excluded.file_path,
            word_count = excluded.word_count,
            char_count = excluded.char_count,
            reading_time = excluded.reading_time,
            updated_at = excluded.updated_at"
    )
    .bind(&note_id)
    .bind(&notebook_id)
    .bind(&title)
    .bind(&new_file_path_str)
    .bind(word_count)
    .bind(char_count)
    .bind(reading_time)
    .bind(&current_time)
    .bind(&current_time)
    .execute(&state.pool)
    .await?;

    // 5. Update FTS5 Search Index
    let _ = sqlx::query("DELETE FROM notes_fts WHERE id = ?")
        .bind(&note_id)
        .execute(&state.pool)
        .await;

    sqlx::query(
        "INSERT INTO notes_fts(id, title, content) VALUES (?, ?, ?)"
    )
    .bind(&note_id)
    .bind(&title)
    .bind(&content)
    .execute(&state.pool)
    .await?;

    // 6. Handle Outgoing Wiki Links & Backlinks
    update_backlinks(&note_id, &content, &state.pool).await?;

    // 7. Extract & Save Inline Tags
    update_inline_tags(&note_id, &content, &state.pool).await?;

    // Resolve absolute sibling assets folder inside AppData/notebooks/assets
    let app_dir = app_handle.path().app_data_dir()?;
    let assets_dir = app_dir.join("notebooks").join("assets");
    let assets_dir_str = assets_dir.to_string_lossy().to_string();
    let asset_url_base = convert_file_src_rust(&assets_dir_str);

    // Compile rendered HTML and translate relative sibling paths to local WebView asset protocol links
    let content_html = render_markdown(&content)
        .replace("src=\"../assets/", &format!("src=\"{}/", asset_url_base));

    Ok(Note {
        id: note_id,
        notebook_id: Some(notebook_id),
        title,
        file_path: new_file_path_str,
        is_pinned: false,
        word_count,
        char_count,
        reading_time,
        created_at: current_time.clone(),
        updated_at: current_time,
        sort_order: 0,
        content: Some(content),
        content_html: Some(content_html),
    })
}

#[tauri::command]
pub async fn delete_note(id: String, state: State<'_, DbState>) -> Result<(), AppError> {
    let mut tx = state.pool.begin().await?;

    // 1. Log tombstone for note
    let current_time = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    sqlx::query(
        "INSERT OR REPLACE INTO tombstones (id, item_type, deleted_at) VALUES (?, 'note', ?)"
    )
    .bind(&id)
    .bind(&current_time)
    .execute(&mut *tx)
    .await?;

    // 2. Retrieve file path to remove physical file
    let row = sqlx::query("SELECT file_path FROM notes WHERE id = ?")
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::Generic("Note not found".to_string()))?;

    let file_path_str: String = row.get("file_path");
    let file_path = PathBuf::from(&file_path_str);

    if file_path.exists() {
        let _ = fs::remove_file(file_path);
    }

    // 3. Delete database records
    sqlx::query("DELETE FROM notes WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn move_note(
    id: String,
    new_notebook_id: String,
    state: State<'_, DbState>,
) -> Result<(), AppError> {
    // 1. Fetch note's existing file_path
    let note_row = sqlx::query("SELECT file_path FROM notes WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::Generic("Note not found".to_string()))?;
    let old_file_path_str: String = note_row.get("file_path");
    let old_file_path = std::path::Path::new(&old_file_path_str);

    // 2. Fetch new notebook folder_path
    let notebook_row = sqlx::query("SELECT folder_path FROM notebooks WHERE id = ?")
        .bind(&new_notebook_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::Generic("Target notebook not found".to_string()))?;
    let notebook_folder: String = notebook_row.get("folder_path");
    let file_name = format!("{}.md", id);
    let new_file_path = PathBuf::from(&notebook_folder).join(&file_name);

    // 3. Move file physically if old exists and path is different
    if old_file_path.exists() && old_file_path != new_file_path {
        // Ensure parent directory exists
        if let Some(parent) = new_file_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::rename(old_file_path, &new_file_path)?;
    }

    // 4. Update note's notebook_id and file_path in DB
    let new_file_path_str = new_file_path.to_string_lossy().to_string();
    sqlx::query("UPDATE notes SET notebook_id = ?, file_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(new_notebook_id)
        .bind(new_file_path_str)
        .bind(id)
        .execute(&state.pool)
        .await?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_pin_note(id: String, state: State<'_, DbState>) -> Result<bool, AppError> {
    let row = sqlx::query("SELECT is_pinned FROM notes WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::Generic("Note not found".to_string()))?;

    let current_pinned: i32 = row.get("is_pinned");
    let next_pinned = if current_pinned == 1 { 0 } else { 1 };

    sqlx::query("UPDATE notes SET is_pinned = ? WHERE id = ?")
        .bind(next_pinned)
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(next_pinned == 1)
}

// --- FTS5 Search Command ---

#[tauri::command]
pub async fn search_notes(query_str: String, state: State<'_, DbState>) -> Result<Vec<SearchResult>, AppError> {
    if query_str.trim().is_empty() {
        return Ok(Vec::new());
    }

    // Query matches using FTS5 MATCH with BM25 ranking and highlighted snippets
    // Use unicode characters like <b> tag to highlight matches
    let rows = sqlx::query(
        "SELECT id, title, snippet(notes_fts, 2, '<b class=\"search-highlight\">', '</b>', '...', 15) as match_snippet
         FROM notes_fts
         WHERE notes_fts MATCH ?
         ORDER BY bm25(notes_fts) ASC LIMIT 30"
    )
    .bind(format!("{}*", query_str))
    .fetch_all(&state.pool)
    .await?;

    let results = rows
        .into_iter()
        .map(|row| SearchResult {
            id: row.get("id"),
            title: row.get("title"),
            snippet: row.get("match_snippet"),
        })
        .collect();

    Ok(results)
}

// --- Snapshot History Commands ---

#[tauri::command]
pub async fn create_snapshot(
    note_id: String,
    label: Option<String>,
    state: State<'_, DbState>,
) -> Result<Snapshot, AppError> {
    // 1. Fetch file content to compress
    let row = sqlx::query("SELECT file_path FROM notes WHERE id = ?")
        .bind(&note_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::Generic("Note not found".to_string()))?;

    let file_path: String = row.get("file_path");
    let content = fs::read_to_string(&file_path)?;

    // 2. Compress content using flate2 Gzip
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(content.as_bytes())?;
    let compressed_bytes = encoder.finish()?;

    // 3. Write snapshot metadata to SQLite
    let snapshot_id = Uuid::new_v4().to_string();
    let current_time = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    sqlx::query(
        "INSERT INTO note_snapshots (id, note_id, label, content_compressed, created_at) 
         VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&snapshot_id)
    .bind(&note_id)
    .bind(&label)
    .bind(&compressed_bytes)
    .bind(&current_time)
    .execute(&state.pool)
    .await?;

    // Limit snapshots to last 50 per note to protect database size
    let _ = sqlx::query(
        "DELETE FROM note_snapshots WHERE id IN (
            SELECT id FROM note_snapshots WHERE note_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET 50
        )"
    )
    .bind(&note_id)
    .execute(&state.pool)
    .await;

    Ok(Snapshot {
        id: snapshot_id,
        note_id,
        label,
        created_at: current_time,
    })
}

#[tauri::command]
pub async fn get_snapshots(note_id: String, state: State<'_, DbState>) -> Result<Vec<Snapshot>, AppError> {
    let rows = sqlx::query(
        "SELECT id, note_id, label, created_at FROM note_snapshots 
         WHERE note_id = ? ORDER BY created_at DESC"
    )
    .bind(note_id)
    .fetch_all(&state.pool)
    .await?;

    let snapshots = rows
        .into_iter()
        .map(|row| Snapshot {
            id: row.get("id"),
            note_id: row.get("note_id"),
            label: row.get("label"),
            created_at: row.get("created_at"),
        })
        .collect();

    Ok(snapshots)
}

#[tauri::command]
pub async fn restore_snapshot(
    snapshot_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, DbState>,
) -> Result<String, AppError> {
    // 1. Fetch compressed snapshot
    let snapshot_row = sqlx::query("SELECT note_id, content_compressed FROM note_snapshots WHERE id = ?")
        .bind(&snapshot_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::Generic("Snapshot not found".to_string()))?;

    let note_id: String = snapshot_row.get("note_id");
    let compressed_bytes: Vec<u8> = snapshot_row.get("content_compressed");

    // Decompress
    let mut decoder = GzDecoder::new(&compressed_bytes[..]);
    let mut decompressed_content = String::new();
    decoder.read_to_string(&mut decompressed_content)?;

    // 2. Fetch active note file path
    let note_row = sqlx::query("SELECT title, notebook_id FROM notes WHERE id = ?")
        .bind(&note_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::Generic("Note not found".to_string()))?;

    let title: String = note_row.get("title");
    let notebook_id: String = note_row.get("notebook_id");

    // 3. Write decompressed content back
    let _ = save_note(Some(note_id), title, decompressed_content.clone(), notebook_id, app_handle, state).await?;

    Ok(decompressed_content)
}

// --- Backlink / outgoing linking scanning algorithm ---

async fn update_backlinks(source_id: &str, content: &str, pool: &SqlitePool) -> Result<(), AppError> {
    // Delete existing backlinks originating from this source note
    sqlx::query("DELETE FROM backlinks WHERE source_note_id = ?")
        .bind(source_id)
        .execute(pool)
        .await?;

    // Scan for [[Wiki Link]] patterns
    let mut targets = Vec::new();
    let mut remaining = content;

    while let Some(start_idx) = remaining.find("[[") {
        let after_start = &remaining[start_idx + 2..];
        if let Some(end_idx) = after_start.find("]]") {
            let inner = &after_start[..end_idx];
            let target_title = if let Some(pipe_idx) = inner.find('|') {
                &inner[..pipe_idx]
            } else {
                inner
            };
            let trimmed = target_title.trim();
            if !trimmed.is_empty() {
                targets.push(trimmed.to_string());
            }
            remaining = &after_start[end_idx + 2..];
        } else {
            remaining = after_start;
        }
    }

    // Resolve matched target note IDs and insert backlinks
    for target_title in targets {
        let row_opt = sqlx::query("SELECT id FROM notes WHERE title = ? COLLATE NOCASE")
            .bind(&target_title)
            .fetch_optional(pool)
            .await?;

        if let Some(row) = row_opt {
            let target_id: String = row.get("id");
            sqlx::query(
                "INSERT OR IGNORE INTO backlinks (source_note_id, target_note_id) VALUES (?, ?)"
            )
            .bind(source_id)
            .bind(&target_id)
            .execute(pool)
            .await?;
        }
    }

    Ok(())
}

#[derive(Serialize, Debug)]
pub struct BacklinkDetails {
    pub id: String,
    pub title: String,
}

#[tauri::command]
pub async fn get_note_backlinks(id: String, state: State<'_, DbState>) -> Result<Vec<BacklinkDetails>, AppError> {
    let rows = sqlx::query(
        "SELECT n.id, n.title FROM notes n 
         JOIN backlinks b ON n.id = b.source_note_id 
         WHERE b.target_note_id = ?"
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    let backlinks = rows
        .into_iter()
        .map(|row| BacklinkDetails {
            id: row.get("id"),
            title: row.get("title"),
        })
        .collect();

    Ok(backlinks)
}

// --- Tag Scanning and Registry Management ---

async fn update_inline_tags(note_id: &str, content: &str, pool: &SqlitePool) -> Result<(), AppError> {
    // Delete existing tags mapped to this note
    sqlx::query("DELETE FROM note_tags WHERE note_id = ?")
        .bind(note_id)
        .execute(pool)
        .await?;

    // Basic inline hashtag extractor: scanning for #alpha characters (e.g. #todo, #ideas)
    // Avoids grabbing standard hex codes or links
    let mut tags = Vec::new();
    for word in content.split_whitespace() {
        if word.starts_with('#') && word.len() > 1 {
            let clean_tag: String = word
                .chars()
                .skip(1)
                .take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
                .collect();
            
            // Check it is not purely numeric (like color values #060814)
            if !clean_tag.is_empty() && !clean_tag.chars().all(|c| c.is_numeric()) {
                tags.push(clean_tag.to_lowercase());
            }
        }
    }

    // De-duplicate
    tags.sort();
    tags.dedup();

    // Color palettes for tag assignment
    let colors = vec!["#63d9ff", "#a78bfa", "#f59e0b", "#ec4899", "#10b981", "#3b82f6", "#ef4444", "#84cc16"];

    for (idx, tag_name) in tags.iter().enumerate() {
        let color = colors[idx % colors.len()];

        // Insert into Tag registry
        sqlx::query("INSERT OR IGNORE INTO tags (name, color_hex) VALUES (?, ?)")
            .bind(tag_name)
            .bind(color)
            .execute(pool)
            .await?;

        // Link to note
        sqlx::query("INSERT OR IGNORE INTO note_tags (note_id, tag_name) VALUES (?, ?)")
            .bind(note_id)
            .bind(tag_name)
            .execute(pool)
            .await?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_all_tags(state: State<'_, DbState>) -> Result<Vec<Tag>, AppError> {
    let rows = sqlx::query("SELECT name, color_hex FROM tags ORDER BY name ASC")
        .fetch_all(&state.pool)
        .await?;

    let tags = rows
        .into_iter()
        .map(|row| Tag {
            name: row.get("name"),
            color_hex: row.get("color_hex"),
        })
        .collect();

    Ok(tags)
}

#[tauri::command]
pub async fn get_note_id_by_title(title: String, state: State<'_, DbState>) -> Result<Option<String>, AppError> {
    let row_opt = sqlx::query("SELECT id FROM notes WHERE title = ? COLLATE NOCASE")
        .bind(title)
        .fetch_optional(&state.pool)
        .await?;

    Ok(row_opt.map(|row| row.get("id")))
}

pub(crate) async fn update_backlinks_internal(source_id: &str, content: &str, pool: &SqlitePool) -> Result<(), AppError> {
    update_backlinks(source_id, content, pool).await
}

pub(crate) async fn update_inline_tags_internal(note_id: &str, content: &str, pool: &SqlitePool) -> Result<(), AppError> {
    update_inline_tags(note_id, content, pool).await
}

#[tauri::command]
pub async fn save_pasted_image(
    _notebook_id: String,
    image_data: Vec<u8>,
    file_extension: String,
    app_handle: tauri::AppHandle,
    _state: State<'_, DbState>,
) -> Result<String, AppError> {
    // 1. Resolve sibling assets folder inside the notebooks directory
    let app_dir = app_handle.path().app_data_dir()?;
    let notebooks_root = app_dir.join("notebooks");
    let assets_dir = notebooks_root.join("assets");

    // 2. Create sibling `assets/` subfolder if it doesn't exist
    fs::create_dir_all(&assets_dir)?;

    // 3. Generate unique filename: img-{uuid}.{extension}
    let filename = format!("img-{}.{}", uuid::Uuid::new_v4(), file_extension);
    let physical_path = assets_dir.join(&filename);

    // 4. Write raw binary bytes to physical file
    fs::write(&physical_path, &image_data)?;

    // 5. Return the standard relative path: `../assets/img-uuid.ext`
    Ok(format!("../assets/{}", filename))
}
