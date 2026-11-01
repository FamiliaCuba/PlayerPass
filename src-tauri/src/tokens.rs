use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoredTokens {
    pub google_refresh: Option<String>,
    pub microsoft_refresh: Option<String>,
}

fn path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("cloud_tokens.json")
}

pub fn load(app_data_dir: &Path) -> StoredTokens {
    fs::read_to_string(path(app_data_dir))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save(app_data_dir: &Path, tokens: &StoredTokens) -> Result<(), String> {
    fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    fs::write(
        path(app_data_dir),
        serde_json::to_string_pretty(tokens).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
