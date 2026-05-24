fn main() {
    // Load .env file from the project root (parent of src-tauri)
    dotenvy::from_filename("../.env").ok();
    
    tauri_build::build()
}
