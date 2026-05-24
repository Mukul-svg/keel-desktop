use std::collections::HashMap;
use std::net::TcpListener;
use std::time::{SystemTime, UNIX_EPOCH};
use keyring_core::Entry;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Sha256, Digest};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const KEYRING_SERVICE: &str = "com.keel.app";
const KEY_ACCESS_TOKEN: &str = "google_drive_access_token";

/// Get Google OAuth Client ID from environment variable
fn get_client_id() -> String {
    std::env::var("GOOGLE_CLIENT_ID")
        .expect("GOOGLE_CLIENT_ID environment variable must be set. Create a .env file or set the environment variable.")
}

/// Get Google OAuth Client Secret from environment variable
fn get_client_secret() -> String {
    std::env::var("GOOGLE_CLIENT_SECRET")
        .expect("GOOGLE_CLIENT_SECRET environment variable must be set. Create a .env file or set the environment variable.")
}
const KEY_REFRESH_TOKEN: &str = "google_drive_refresh_token";
const KEY_EMAIL: &str = "google_drive_email";
const KEY_EXPIRES_AT: &str = "google_drive_expires_at";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    pub modifiedTime: Option<String>,
    pub md5Checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveFileList {
    pub files: Vec<DriveFile>,
}

/// Helper function to retrieve the current epoch timestamp in seconds
fn current_time_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Thread-safe helper to append timestamped debug messages to appData/keel_sync_debug.log
pub fn log_debug(app: &AppHandle, message: &str) {
    if let Ok(app_dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&app_dir);
        let log_file_path = app_dir.join("keel_sync_debug.log");
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file_path)
        {
            use std::io::Write;
            let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
            let _ = writeln!(file, "[{}] {}", timestamp, message);
        }
    }
}

/// Start a dynamic TCP loopback server on an ephemeral port, launch browser, and complete the OAuth 2.0 PKCE exchange.
pub async fn start_oauth_flow(app: &AppHandle) -> Result<String, String> {
    log_debug(app, "=== Starting Google Drive OAuth Flow ===");

    // 1. Bind TCP listener on 127.0.0.1:0 to allocate a dynamic ephemeral port
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| {
        let msg = format!("Failed to bind TCP listener: {}", e);
        log_debug(app, &msg);
        msg
    })?;
    let port = listener.local_addr().map_err(|e| {
        let msg = format!("Failed to get local address: {}", e);
        log_debug(app, &msg);
        msg
    })?.port();
    let redirect_uri = format!("http://127.0.0.1:{}", port);
    log_debug(app, &format!("Allocated ephemeral dynamic loopback port: {}. Redirect URI: {}", port, redirect_uri));

    // 2. Generate PKCE Verifier and Challenge
    let code_verifier = format!("{}{}{}", Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4()).replace("-", "");
    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let challenge_bytes = hasher.finalize();
    let code_challenge = URL_SAFE_NO_PAD.encode(challenge_bytes);
    log_debug(app, "Generated secure PKCE verifier and challenge code parameters.");

    // 3. Construct Google OAuth Consent URL
    // We add prompt=consent & access_type=offline to guarantee Google returns a refresh_token
    let scope = "https://www.googleapis.com/auth/drive.appdata email";
    let oauth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
         response_type=code&\
         client_id={}&\
         redirect_uri={}&\
         scope={}&\
         code_challenge={}&\
         code_challenge_method=S256&\
         access_type=offline&\
         prompt=consent",
         get_client_id(),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(scope),
        code_challenge
    );
    log_debug(app, &format!("OAuth Consent Screen URL constructed: {}", oauth_url));

    // 4. Open default system browser to launch the login
    let opener = app.state::<tauri_plugin_opener::Opener<tauri::Wry>>();
    opener.open_path(oauth_url, None::<String>).map_err(|e| {
        let msg = format!("Failed to open system browser: {}", e);
        log_debug(app, &msg);
        msg
    })?;
    log_debug(app, "Successfully triggered default system browser navigation to Google Sign In.");

    // 5. Block asynchronously waiting for the redirect on the TCP listener
    // We convert the std listener into a tokio listener and set a 120-second timeout
    let tokio_listener = tokio::net::TcpListener::from_std(listener).map_err(|e| {
        let msg = format!("Failed to convert TCP listener: {}", e);
        log_debug(app, &msg);
        msg
    })?;
    
    let verifier_clone = code_verifier.clone();
    let redirect_uri_clone = redirect_uri.clone();
    let app_log = app.clone();
    
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    log_debug(app, "Awaiting Google redirect callback. 120s countdown started...");
    let auth_code = match tokio::time::timeout(
        std::time::Duration::from_secs(120),
        async move {
            loop {
                log_debug(&app_log, "Socket listening for connection...");
                let (mut stream, peer_addr) = match tokio_listener.accept().await {
                    Ok(val) => val,
                    Err(e) => {
                        log_debug(&app_log, &format!("TCP accept error: {}", e));
                        continue;
                    }
                };
                
                log_debug(&app_log, &format!("Accepted connection from peer: {}", peer_addr));
                let mut buffer = [0; 4096];
                let bytes_read = match stream.read(&mut buffer).await {
                    Ok(n) => n,
                    Err(e) => {
                        log_debug(&app_log, &format!("Failed to read request stream bytes: {}", e));
                        continue;
                    }
                };
                
                let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                
                // Handle speculative Chrome pre-connect requests or favicon probes
                if request.contains("GET /favicon.ico") {
                    log_debug(&app_log, "Speculative request /favicon.ico received. Terminating connection with 404.");
                    let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                    let _ = stream.write_all(response.as_bytes()).await;
                    let _ = stream.flush().await;
                    continue;
                }

                log_debug(&app_log, &format!("HTTP request received headers:\n{}", request.lines().next().unwrap_or("[Empty]")));

                // Extract authorization code from GET query parameters
                if let Some(code_idx) = request.find("code=") {
                    let sub = &request[code_idx + 5..];
                    let end_idx = sub.chars().position(|c| c == ' ' || c == '&').unwrap_or(sub.len());
                    let code = sub[..end_idx].to_string();
                    
                    log_debug(&app_log, "Extracted authorization code successfully!");

                    // Render beautiful success landing page in user's browser
                    let success_html = "\
                        HTTP/1.1 200 OK\r\n\
                        Content-Type: text/html; charset=utf-8\r\n\
                        Connection: close\r\n\r\n\
                        <!DOCTYPE html>\n\
                        <html>\n\
                        <head>\n\
                          <title>Authentication Successful - Keel</title>\n\
                          <style>\n\
                            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }\n\
                            .card { background: rgba(255, 255, 255, 0.05); padding: 40px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); text-align: center; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); backdrop-filter: blur(8px); max-width: 420px; }\n\
                            h1 { color: #22d3ee; margin-top: 0; font-size: 24px; font-weight: 600; }\n\
                            p { color: #9ca3af; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }\n\
                            .success-icon { width: 56px; height: 56px; background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: 28px; line-height: 56px; border-radius: 50%; margin: 0 auto 20px auto; border: 1px solid rgba(16, 185, 129, 0.3); }\n\
                          </style>\n\
                        </head>\n\
                        <body>\n\
                          <div class='card'>\n\
                            <div class='success-icon'>✓</div>\n\
                            <h1>Authentication Successful!</h1>\n\
                            <p>Keel has successfully linked with your Google Drive account. You can safely close this browser window and return to your app to sync notes.</p>\n\
                          </div>\n\
                        </body>\n\
                        </html>";
                        
                    let _ = stream.write_all(success_html.as_bytes()).await;
                    let _ = stream.flush().await;
                    
                    return Ok(code);
                } else if request.contains("GET /") {
                    // Check if error parameter is present in redirect URL
                    if let Some(err_idx) = request.find("error=") {
                        let sub = &request[err_idx + 6..];
                        let end_idx = sub.chars().position(|c| c == ' ' || c == '&').unwrap_or(sub.len());
                        let error_msg = sub[..end_idx].to_string();
                        log_debug(&app_log, &format!("Google OAuth callback returned error parameter: {}", error_msg));
                        
                        let error_html = format!(
                            "HTTP/1.1 400 Bad Request\r\n\
                             Content-Type: text/html; charset=utf-8\r\n\
                             Connection: close\r\n\r\n\
                             <!DOCTYPE html>\n\
                             <html>\n\
                             <head>\n\
                               <title>Authentication Failed - Keel</title>\n\
                               <style>\n\
                                 body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}\n\
                                 .card {{ background: rgba(255, 255, 255, 0.05); padding: 40px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); text-align: center; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); backdrop-filter: blur(8px); max-width: 420px; }}\n\
                                 h1 {{ color: #f87171; margin-top: 0; font-size: 24px; font-weight: 600; }}\n\
                                 p {{ color: #d1d5db; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }}\n\
                                 .error-icon {{ width: 56px; height: 56px; background: rgba(239, 68, 68, 0.15); color: #ef4444; font-size: 28px; line-height: 56px; border-radius: 50%; margin: 0 auto 20px auto; border: 1px solid rgba(239, 68, 68, 0.3); }}\n\
                               </style>\n\
                             </head>\n\
                             <body>\n\
                               <div class='card'>\n\
                                 <div class='error-icon'>✗</div>\n\
                                 <h1>Authentication Failed</h1>\n\
                                 <p>Google returned an error during the authentication flow: <strong>{}</strong></p>\n\
                               </div>\n\
                             </body>\n\
                             </html>",
                            error_msg
                        );
                        let _ = stream.write_all(error_html.as_bytes()).await;
                        let _ = stream.flush().await;
                        
                        return Err(format!("Google returned OAuth error parameter: {}", error_msg));
                    }

                    log_debug(&app_log, "Incoming request contains no authorization code or error.");
                    let err_response = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nMissing authorization code parameter.";
                    let _ = stream.write_all(err_response.as_bytes()).await;
                    let _ = stream.flush().await;
                    return Err("Missing 'code' query parameter in Google callback.".to_string());
                }
            }
        }
    ).await {
        Ok(res) => res,
        Err(_) => {
            let msg = "Authentication timed out (120 seconds exceeded). Please try again.".to_string();
            log_debug(app, &msg);
            return Err(msg);
        }
    }?;

    // 6. Exchange Authorization Code for Access & Refresh Tokens
    log_debug(app, "Exchanging auth code for access & refresh tokens...");
    let client = reqwest::Client::new();
    let client_id = get_client_id();
    let client_secret = get_client_secret();
    let mut params = HashMap::new();
    params.insert("client_id", client_id.as_str());
    params.insert("client_secret", client_secret.as_str());
    params.insert("code", &auth_code);
    params.insert("code_verifier", &verifier_clone);
    params.insert("grant_type", "authorization_code");
    params.insert("redirect_uri", &redirect_uri_clone);

    let token_res = match client.post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
    {
        Ok(res) => res,
        Err(e) => {
            let msg = format!("Token exchange HTTP post request failed: {}", e);
            log_debug(app, &msg);
            return Err(msg);
        }
    };

    if !token_res.status().is_success() {
        let status = token_res.status();
        let err_text = token_res.text().await.unwrap_or_default();
        let msg = format!("Google token exchange endpoint returned status code {}: {}", status, err_text);
        log_debug(app, &msg);
        return Err(msg);
    }

    let token_json: serde_json::Value = match token_res.json().await {
        Ok(json) => json,
        Err(e) => {
            let msg = format!("Failed to parse token response JSON: {}", e);
            log_debug(app, &msg);
            return Err(msg);
        }
    };

    log_debug(app, "Token response received successfully!");

    let access_token = match token_json["access_token"].as_str() {
        Some(token) => token.to_string(),
        None => {
            let msg = format!("Missing access_token in token response JSON: {}", token_json);
            log_debug(app, &msg);
            return Err(msg);
        }
    };
    
    // Refresh token is critical, returned only on initial consent grant
    let refresh_token = match token_json["refresh_token"].as_str() {
        Some(token) => token.to_string(),
        None => {
            let msg = "Missing refresh_token in response. Make sure to remove Keel permission in Google Account Settings and retry so Google issues a fresh refresh token.".to_string();
            log_debug(app, &msg);
            return Err(msg);
        }
    };
        
    let expires_in = token_json["expires_in"].as_u64().unwrap_or(3600);
    let expires_at = current_time_secs() + expires_in;
    log_debug(app, &format!("Access token acquired. Expires in {} seconds (at epoch {}).", expires_in, expires_at));

    // 7. Get Connected Account Email Details
    log_debug(app, "Retrieving connected account profile email from Google userinfo API...");
    let user_info_res = match client.get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(&access_token)
        .send()
        .await
    {
        Ok(res) => res,
        Err(e) => {
            let msg = format!("Userinfo profile request failed: {}", e);
            log_debug(app, &msg);
            return Err(msg);
        }
    };
        
    let user_info_json: serde_json::Value = match user_info_res.json().await {
        Ok(json) => json,
        Err(e) => {
            let msg = format!("Failed to parse userinfo profile response JSON: {}", e);
            log_debug(app, &msg);
            return Err(msg);
        }
    };
        
    let email = user_info_json["email"].as_str()
        .unwrap_or("account@gmail.com").to_string();
    log_debug(app, &format!("Successfully resolved user email: {}", email));

    // 8. Store securely in Windows Credential Manager keyring
    log_debug(app, "Saving sync credentials into Windows Credential Manager...");
    if let Err(e) = save_credentials(&email, &access_token, &refresh_token, expires_at) {
        let msg = format!("OS keyring credentials save failed: {}", e);
        log_debug(app, &msg);
        return Err(msg);
    }
    log_debug(app, &format!("Successfully linked Google Drive account: {}. OAuth flow complete!", email));

    Ok(email)
}

/// Save token credentials into the native OS keyring
fn save_credentials(email: &str, access: &str, refresh: &str, expires_at: u64) -> Result<(), String> {
    let entry_email = Entry::new(KEYRING_SERVICE, KEY_EMAIL).map_err(|e| e.to_string())?;
    entry_email.set_password(email).map_err(|e| e.to_string())?;

    let entry_access = Entry::new(KEYRING_SERVICE, KEY_ACCESS_TOKEN).map_err(|e| e.to_string())?;
    entry_access.set_password(access).map_err(|e| e.to_string())?;

    let entry_refresh = Entry::new(KEYRING_SERVICE, KEY_REFRESH_TOKEN).map_err(|e| e.to_string())?;
    entry_refresh.set_password(refresh).map_err(|e| e.to_string())?;

    let entry_expires = Entry::new(KEYRING_SERVICE, KEY_EXPIRES_AT).map_err(|e| e.to_string())?;
    entry_expires.set_password(&expires_at.to_string()).map_err(|e| e.to_string())?;

    Ok(())
}

/// Retrieve and automatically refresh access token if expired, returning a valid Access Token
pub async fn get_valid_access_token() -> Result<String, String> {
    let entry_access = Entry::new(KEYRING_SERVICE, KEY_ACCESS_TOKEN).map_err(|e| e.to_string())?;
    let entry_refresh = Entry::new(KEYRING_SERVICE, KEY_REFRESH_TOKEN).map_err(|e| e.to_string())?;
    let entry_expires = Entry::new(KEYRING_SERVICE, KEY_EXPIRES_AT).map_err(|e| e.to_string())?;
    let entry_email = Entry::new(KEYRING_SERVICE, KEY_EMAIL).map_err(|e| e.to_string())?;

    let access_token = entry_access.get_password().map_err(|_| "Access token not found in keyring".to_string())?;
    let refresh_token = entry_refresh.get_password().map_err(|_| "Refresh token not found in keyring".to_string())?;
    let expires_at_str = entry_expires.get_password().map_err(|_| "Expiration time not found in keyring".to_string())?;
    let email = entry_email.get_password().map_err(|_| "Email not found in keyring".to_string())?;

    let expires_at: u64 = expires_at_str.parse().unwrap_or(0);
    let now = current_time_secs();

    // Check if the current token has expired (or is close to expiring within 60s)
    if now + 60 >= expires_at {
        // Exchange refresh token for a brand new access token
        let client = reqwest::Client::new();
        let client_id = get_client_id();
        let client_secret = get_client_secret();
        let mut params = HashMap::new();
        params.insert("client_id", client_id.as_str());
        params.insert("client_secret", client_secret.as_str());
        params.insert("refresh_token", &refresh_token);
        params.insert("grant_type", "refresh_token");

        let refresh_res = client.post("https://oauth2.googleapis.com/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("HTTP refresh post failed: {}", e))?;

        if !refresh_res.status().is_success() {
            let err_text = refresh_res.text().await.unwrap_or_default();
            return Err(format!("Refresh token exchange failed: {}", err_text));
        }

        let refresh_json: serde_json::Value = refresh_res.json()
            .await
            .map_err(|e| format!("Failed to parse refresh token JSON: {}", e))?;

        let new_access = refresh_json["access_token"].as_str()
            .ok_or_else(|| "Missing access_token in refresh response".to_string())?.to_string();
        let expires_in = refresh_json["expires_in"].as_u64().unwrap_or(3600);
        let new_expires_at = now + expires_in;

        // Save updated values in the keychain
        save_credentials(&email, &new_access, &refresh_token, new_expires_at)?;

        Ok(new_access)
    } else {
        Ok(access_token)
    }
}

/// Purges all Google Drive sync credentials from the Keychain
pub fn clear_credentials() -> Result<(), String> {
    let entry_access = Entry::new(KEYRING_SERVICE, KEY_ACCESS_TOKEN).map_err(|e| e.to_string())?;
    let _ = entry_access.delete_credential();

    let entry_refresh = Entry::new(KEYRING_SERVICE, KEY_REFRESH_TOKEN).map_err(|e| e.to_string())?;
    let _ = entry_refresh.delete_credential();

    let entry_email = Entry::new(KEYRING_SERVICE, KEY_EMAIL).map_err(|e| e.to_string())?;
    let _ = entry_email.delete_credential();

    let entry_expires = Entry::new(KEYRING_SERVICE, KEY_EXPIRES_AT).map_err(|e| e.to_string())?;
    let _ = entry_expires.delete_credential();

    Ok(())
}

/// Read the connected Google account's email from the keyring (if exists)
pub fn get_connected_email() -> Option<String> {
    let entry_email = Entry::new(KEYRING_SERVICE, KEY_EMAIL).ok()?;
    entry_email.get_password().ok()
}

// =========================================================================
// GOOGLE DRIVE API ACTIONS
// =========================================================================

/// Lists all JSON files inside the AppData sandbox folder
pub async fn list_drive_files(access_token: &str) -> Result<Vec<DriveFile>, String> {
    let client = reqwest::Client::new();
    let url = "https://www.googleapis.com/drive/v3/files?\
               spaces=appDataFolder&\
               q=%27appDataFolder%27+in+parents+and+trashed+%3D+false&\
               fields=files(id%2Cname%2CmodifiedTime%2Cmd5Checksum)";

    let res = client.get(url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Drive List API HTTP call failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Drive List API returned error: {}", err_text));
    }

    let file_list: DriveFileList = res.json()
        .await
        .map_err(|e| format!("Failed to parse Drive List JSON response: {}", e))?;

    Ok(file_list.files)
}

/// Uploads a file (either insert new or update existing) to the AppData sandbox.
/// If file_id is provided, it performs an UPDATE (PATCH), otherwise a brand new INSERT (POST).
pub async fn upload_drive_file(
    access_token: &str,
    name: &str,
    content: &str,
    file_id: Option<&str>,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    match file_id {
        Some(id) => {
            // --- UPDATE EXISTING FILE ---
            // PATCH request to update file metadata (optional) or upload content directly
            // Google Drive supports updating content via a simple upload path:
            // PUT /upload/drive/v3/files/fileId?uploadType=media
            let url = format!(
                "https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=media",
                id
            );

            let res = client.patch(&url)
                .bearer_auth(access_token)
                .header("Content-Type", "application/json")
                .body(content.to_string())
                .send()
                .await
                .map_err(|e| format!("Drive Update HTTP patch failed: {}", e))?;

            if !res.status().is_success() {
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("Drive Update failed: {}", err_text));
            }

            let response_json: serde_json::Value = res.json()
                .await
                .map_err(|e| format!("Failed to parse update JSON response: {}", e))?;

            let uploaded_id = response_json["id"].as_str()
                .ok_or_else(|| "Missing id in update response".to_string())?.to_string();
                
            Ok(uploaded_id)
        }
        None => {
            // --- INSERT NEW FILE (Multipart or simple metadata + media) ---
            // We'll use Google Drive's standard Multipart Upload to post metadata (parents, name) and media (content) in one single request.
            // URL: https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
            let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
            
            // Build boundary-based multipart body manually to keep it solid without additional crates
            let boundary = format!("-------keelsyncboundary{}", Uuid::new_v4());
            let metadata = json!({
                "name": name,
                "parents": ["appDataFolder"]
            }).to_string();

            let mut body = Vec::new();
            
            // Part 1: Metadata
            body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
            body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
            body.extend_from_slice(metadata.as_bytes());
            body.extend_from_slice(b"\r\n");

            // Part 2: Media Content
            body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
            body.extend_from_slice(b"Content-Type: application/json\r\n\r\n");
            body.extend_from_slice(content.as_bytes());
            body.extend_from_slice(b"\r\n");

            // End boundary
            body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

            let res = client.post(url)
                .bearer_auth(access_token)
                .header("Content-Type", format!("multipart/related; boundary={}", boundary))
                .body(body)
                .send()
                .await
                .map_err(|e| format!("Drive Upload HTTP post failed: {}", e))?;

            if !res.status().is_success() {
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("Drive Upload returned error: {}", err_text));
            }

            let response_json: serde_json::Value = res.json()
                .await
                .map_err(|e| format!("Failed to parse upload JSON response: {}", e))?;

            let uploaded_id = response_json["id"].as_str()
                .ok_or_else(|| "Missing id in upload response".to_string())?.to_string();

            Ok(uploaded_id)
        }
    }
}

/// Downloads content of a specific file inside Google Drive using its file_id
pub async fn download_drive_file(access_token: &str, file_id: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{}?alt=media",
        file_id
    );

    let res = client.get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Drive Download HTTP call failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Drive Download failed for file_id {}: {}", file_id, err_text));
    }

    let file_content = res.text()
        .await
        .map_err(|e| format!("Failed to read downloaded body string: {}", e))?;

    Ok(file_content)
}

/// Deletes a file inside the AppData sandbox (useful if notebook or note is hard-deleted and synced)
#[allow(dead_code)]
pub async fn delete_drive_file(access_token: &str, file_id: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!("https://www.googleapis.com/drive/v3/files/{}", file_id);

    let res = client.delete(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Drive Delete HTTP call failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Drive Delete failed for file_id {}: {}", file_id, err_text));
    }

    Ok(())
}

/// Uploads a raw binary file (like an image) to the AppData sandbox.
/// If file_id is provided, it performs a PATCH update, otherwise a Multipart POST insert.
pub async fn upload_drive_file_bytes(
    access_token: &str,
    name: &str,
    bytes: &[u8],
    mime_type: &str,
    file_id: Option<&str>,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    match file_id {
        Some(id) => {
            // PATCH update to /upload/drive/v3/files/fileId?uploadType=media
            let url = format!(
                "https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=media",
                id
            );

            let res = client.patch(&url)
                .bearer_auth(access_token)
                .header("Content-Type", mime_type)
                .body(bytes.to_vec())
                .send()
                .await
                .map_err(|e| format!("Drive Update Binary PATCH failed: {}", e))?;

            if !res.status().is_success() {
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("Drive Binary Update failed: {}", err_text));
            }

            let response_json: serde_json::Value = res.json()
                .await
                .map_err(|e| format!("Failed to parse update binary JSON response: {}", e))?;

            let uploaded_id = response_json["id"].as_str()
                .ok_or_else(|| "Missing id in update binary response".to_string())?.to_string();
                
            Ok(uploaded_id)
        }
        None => {
            // Multipart POST insert to /upload/drive/v3/files?uploadType=multipart
            let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
            
            let boundary = format!("-------keelsyncboundary{}", uuid::Uuid::new_v4());
            let metadata = serde_json::json!({
                "name": name,
                "parents": ["appDataFolder"]
            }).to_string();

            let mut body = Vec::new();
            
            // Part 1: Metadata
            body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
            body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
            body.extend_from_slice(metadata.as_bytes());
            body.extend_from_slice(b"\r\n");

            // Part 2: Media Content
            body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
            body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", mime_type).as_bytes());
            body.extend_from_slice(bytes);
            body.extend_from_slice(b"\r\n");

            // End boundary
            body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

            let res = client.post(url)
                .bearer_auth(access_token)
                .header("Content-Type", format!("multipart/related; boundary={}", boundary))
                .body(body)
                .send()
                .await
                .map_err(|e| format!("Drive Upload Binary POST failed: {}", e))?;

            if !res.status().is_success() {
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("Drive Upload Binary returned error: {}", err_text));
            }

            let response_json: serde_json::Value = res.json()
                .await
                .map_err(|e| format!("Failed to parse upload binary JSON response: {}", e))?;

            let uploaded_id = response_json["id"].as_str()
                .ok_or_else(|| "Missing id in upload binary response".to_string())?.to_string();

            Ok(uploaded_id)
        }
    }
}

/// Downloads a file as raw binary bytes from Google Drive using its file_id
pub async fn download_drive_file_bytes(
    access_token: &str,
    file_id: &str,
) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{}?alt=media",
        file_id
    );

    let res = client.get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Drive Download Binary HTTP call failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Drive Download Binary failed for file_id {}: {}", file_id, err_text));
    }

    let bytes = res.bytes()
        .await
        .map_err(|e| format!("Failed to read downloaded binary bytes: {}", e))?;

    Ok(bytes.to_vec())
}

// =========================================================================
// TAURI COMMAND WRAPPERS
// =========================================================================

#[tauri::command]
pub async fn connect_google_drive(app: tauri::AppHandle) -> Result<String, String> {
    start_oauth_flow(&app).await
}

#[tauri::command]
pub fn disconnect_google_drive() -> Result<(), String> {
    clear_credentials()
}

#[tauri::command]
pub async fn trigger_gdrive_sync(
    app: tauri::AppHandle,
    last_sync_time: Option<String>,
) -> Result<crate::sync_engine::SyncResult, String> {
    Ok(crate::sync_engine::execute_sync_cycle(&app, last_sync_time).await)
}

#[tauri::command]
pub async fn resolve_gdrive_conflict(
    app: tauri::AppHandle,
    note_id: String,
    strategy: String,
) -> Result<(), crate::error::AppError> {
    crate::sync_engine::resolve_gdrive_conflict_strategy(&app, note_id, strategy).await
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncStatus {
    pub is_connected: bool,
    pub email: Option<String>,
}

#[tauri::command]
pub fn get_sync_status() -> Result<SyncStatus, String> {
    let email = get_connected_email();
    Ok(SyncStatus {
        is_connected: email.is_some(),
        email,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keyring() {
        // Initialize the store if it's not already set in tests
        let _ = keyring_core::set_default_store(
            windows_native_keyring_store::Store::new().unwrap()
        );
        let entry = Entry::new("test_service", "test_key").unwrap();
        entry.set_password("test_val").unwrap();
        let val = entry.get_password().unwrap();
        assert_eq!(val, "test_val");
        entry.delete_credential().unwrap();
        println!("Keyring test passed successfully!");
    }

    #[test]
    fn test_parse_code() {
        // Helper inline parsing logic exactly as implemented in start_oauth_flow
        let parse = |request: &str| -> Option<String> {
            request.find("code=").map(|code_idx| {
                let sub = &request[code_idx + 5..];
                let end_idx = sub.chars().position(|c| c == ' ' || c == '&').unwrap_or(sub.len());
                sub[..end_idx].to_string()
            })
        };

        // Standard case where code is first parameter
        assert_eq!(parse("GET /?code=XYZ123&scope=email HTTP/1.1"), Some("XYZ123".to_string()));

        // Case where code is last parameter
        assert_eq!(parse("GET /?scope=email&code=ABC789 HTTP/1.1"), Some("ABC789".to_string()));

        // Case with multiple parameters and trailing spaces
        assert_eq!(parse("GET /?code=DEF456&scope=drive&state=999 HTTP/1.1"), Some("DEF456".to_string()));
    }
}
