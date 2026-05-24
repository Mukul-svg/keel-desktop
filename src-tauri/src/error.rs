use serde::Serialize;
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    Database(sqlx::Error),
    Io(std::io::Error),
    Json(serde_json::Error),
    Tauri(tauri::Error),
    Reqwest(reqwest::Error),
    Keyring(keyring_core::Error),
    Generic(String),
}

impl std::error::Error for AppError {}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Database(e) => write!(f, "Database error: {}", e),
            AppError::Io(e) => write!(f, "I/O error: {}", e),
            AppError::Json(e) => write!(f, "JSON error: {}", e),
            AppError::Tauri(e) => write!(f, "Tauri error: {}", e),
            AppError::Reqwest(e) => write!(f, "HTTP error: {}", e),
            AppError::Keyring(e) => write!(f, "Keyring error: {}", e),
            AppError::Generic(s) => write!(f, "{}", s),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// Implement converters to support standard ? operator propagation
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::Database(err)
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Json(err)
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        AppError::Tauri(err)
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::Reqwest(err)
    }
}

impl From<keyring_core::Error> for AppError {
    fn from(err: keyring_core::Error) -> Self {
        AppError::Keyring(err)
    }
}

impl From<String> for AppError {
    fn from(err: String) -> Self {
        AppError::Generic(err)
    }
}

impl From<&str> for AppError {
    fn from(err: &str) -> Self {
        AppError::Generic(err.to_string())
    }
}
