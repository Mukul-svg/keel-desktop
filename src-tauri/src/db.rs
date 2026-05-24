use sqlx::{sqlite::SqlitePool, Row};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

pub struct DbState {
    pub pool: SqlitePool,
}

pub async fn init_db(app_handle: &AppHandle) -> Result<SqlitePool, Box<dyn std::error::Error>> {
    // 1. Resolve AppData directory
    let app_dir = app_handle.path().app_data_dir()?;
    fs::create_dir_all(&app_dir)?;

    // 2. Create notebooks directory inside AppData
    let notebooks_dir = app_dir.join("notebooks");
    fs::create_dir_all(&notebooks_dir)?;

    // 3. Resolve database file path
    let db_path = app_dir.join("keel.db");

    // 4. Create SQLite file if not exists
    if !db_path.exists() {
        fs::File::create(&db_path)?;
    }

    // 5. Connect to SQLite database
    let connect_options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&db_path)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal);

    let pool = SqlitePool::connect_with(connect_options).await?;

    // 6. Run migrations (Create tables, indices, FTS5 and triggers)
    setup_schema(&pool).await?;

    // 7. Seed Default Notebook (Inbox)
    seed_default_notebook(&pool, &notebooks_dir).await?;

    Ok(pool)
}

async fn setup_schema(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Enable Foreign Keys
    sqlx::query("PRAGMA foreign_keys = ON;").execute(pool).await?;

    // 1. Notebooks table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS notebooks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            emoji TEXT DEFAULT '📝',
            description TEXT,
            folder_path TEXT NOT NULL UNIQUE,
            is_pinned INTEGER DEFAULT 0 CHECK (is_pinned IN (0, 1)),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );"
    ).execute(pool).await?;

    // Check if sort_order column exists
    let has_sort_order = {
        let rows = sqlx::query("PRAGMA table_info(notebooks)")
            .fetch_all(pool)
            .await?;
        rows.iter().any(|row| {
            let col_name: String = row.get("name");
            col_name == "sort_order"
        })
    };

    if !has_sort_order {
        sqlx::query("ALTER TABLE notebooks ADD COLUMN sort_order INTEGER DEFAULT 0;")
            .execute(pool)
            .await?;
    }

    // Check if is_pinned column exists
    let has_is_pinned = {
        let rows = sqlx::query("PRAGMA table_info(notebooks)")
            .fetch_all(pool)
            .await?;
        rows.iter().any(|row| {
            let col_name: String = row.get("name");
            col_name == "is_pinned"
        })
    };

    if !has_is_pinned {
        sqlx::query("ALTER TABLE notebooks ADD COLUMN is_pinned INTEGER DEFAULT 0;")
            .execute(pool)
            .await?;
    }

    // 2. Notes table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            notebook_id TEXT,
            title TEXT NOT NULL,
            file_path TEXT NOT NULL UNIQUE,
            is_pinned INTEGER DEFAULT 0 CHECK (is_pinned IN (0, 1)),
            word_count INTEGER DEFAULT 0,
            char_count INTEGER DEFAULT 0,
            reading_time INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE SET NULL
        );"
    ).execute(pool).await?;

    // Check if sort_order column exists in notes table
    let has_notes_sort_order = {
        let rows = sqlx::query("PRAGMA table_info(notes)")
            .fetch_all(pool)
            .await?;
        rows.iter().any(|row| {
            let col_name: String = row.get("name");
            col_name == "sort_order"
        })
    };

    if !has_notes_sort_order {
        sqlx::query("ALTER TABLE notes ADD COLUMN sort_order INTEGER DEFAULT 0;")
            .execute(pool)
            .await?;
    }

    // 3. Snapshots / Versions history
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS note_snapshots (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            label TEXT,
            content_compressed BLOB NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );"
    ).execute(pool).await?;

    // 4. Tags
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tags (
            name TEXT PRIMARY KEY,
            color_hex TEXT NOT NULL
        );"
    ).execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS note_tags (
            note_id TEXT NOT NULL,
            tag_name TEXT NOT NULL,
            PRIMARY KEY (note_id, tag_name),
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_name) REFERENCES tags(name) ON DELETE CASCADE
        );"
    ).execute(pool).await?;

    // 5. Backlinks
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS backlinks (
            source_note_id TEXT NOT NULL,
            target_note_id TEXT NOT NULL,
            PRIMARY KEY (source_note_id, target_note_id),
            FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
            FOREIGN KEY (target_note_id) REFERENCES notes(id) ON DELETE CASCADE
        );"
    ).execute(pool).await?;

    // 6. FTS5 Virtual Table for Search
    sqlx::query(
        "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            id UNINDEXED,
            title,
            content,
            tokenize=\"unicode61 remove_diacritics 1\"
        );"
    ).execute(pool).await?;

    // 7. Database Triggers for syncing search FTS index
    // Trigger on delete
    sqlx::query(
        "CREATE TRIGGER IF NOT EXISTS after_note_delete
         AFTER DELETE ON notes
         BEGIN
             DELETE FROM notes_fts WHERE id = old.id;
         END;"
    ).execute(pool).await?;

    // 8. Deduplicate FTS5 index rows that were created due to earlier INSERT OR REPLACE bugs
    let _ = sqlx::query(
        "DELETE FROM notes_fts
         WHERE rowid NOT IN (
             SELECT MIN(rowid)
             FROM notes_fts
             GROUP BY id
         );"
    )
    .execute(pool)
    .await;

    // 9. Create sync_metadata table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sync_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );"
    ).execute(pool).await?;

    // 10. Create tombstones table to prevent data resurrection
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tombstones (
            id TEXT PRIMARY KEY,
            item_type TEXT NOT NULL, -- 'note' or 'notebook'
            deleted_at TEXT NOT NULL
        );"
    ).execute(pool).await?;

    Ok(())
}

async fn seed_default_notebook(pool: &SqlitePool, notebooks_dir: &PathBuf) -> Result<(), sqlx::Error> {
    let inbox_id = "inbox";
    let inbox_name = "Inbox";
    let inbox_path = notebooks_dir.join("Inbox");

    // Create physical folder
    if !inbox_path.exists() {
        let _ = fs::create_dir_all(&inbox_path);
    }

    // Insert Inbox notebook metadata if not exists
    sqlx::query(
        "INSERT OR IGNORE INTO notebooks (id, name, emoji, description, folder_path) 
         VALUES (?, ?, ?, ?, ?)"
    )
    .bind(inbox_id)
    .bind(inbox_name)
    .bind("📥")
    .bind("Default inbox for quick capture notes.")
    .bind(inbox_path.to_string_lossy().to_string())
    .execute(pool)
    .await?;

    Ok(())
}
