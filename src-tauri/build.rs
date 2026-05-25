fn main() {
    // Load .env file from the project root (parent of src-tauri)
    dotenvy::from_filename("../.env").ok();
    
    if let Ok(client_id) = std::env::var("GOOGLE_CLIENT_ID") {
        println!("cargo:rustc-env=GOOGLE_CLIENT_ID={}", client_id);
    }
    if let Ok(client_secret) = std::env::var("GOOGLE_CLIENT_SECRET") {
        println!("cargo:rustc-env=GOOGLE_CLIENT_SECRET={}", client_secret);
    }
    
    tauri_build::build()
}
