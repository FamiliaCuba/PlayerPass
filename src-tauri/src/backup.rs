use crate::profile::{self, Profile};
use crate::vault;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackage {
    pub version: u32,
    pub created_at: String,
    pub hostname: String,
    pub profile: Profile,
    /// Contenido del vault.enc (ya cifrado).
    pub vault_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudBackupItem {
    pub id: String,
    pub name: String,
    pub modified_at: String,
}

pub fn build_package(app_data_dir: &Path, hostname: &str) -> Result<BackupPackage, String> {
    let vault_path = vault::vault_path(app_data_dir);
    if !vault_path.exists() {
        return Err("No hay vault para respaldar".into());
    }
    let raw = fs::read(&vault_path).map_err(|e| e.to_string())?;
    Ok(BackupPackage {
        version: 1,
        created_at: Utc::now().to_rfc3339(),
        hostname: hostname.to_string(),
        profile: profile::load(app_data_dir),
        vault_b64: B64.encode(raw),
    })
}

pub fn package_to_bytes(package: &BackupPackage) -> Result<Vec<u8>, String> {
    serde_json::to_vec_pretty(package).map_err(|e| e.to_string())
}

pub fn package_from_bytes(bytes: &[u8]) -> Result<BackupPackage, String> {
    let package: BackupPackage = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    if package.version != 1 {
        return Err("Versión de backup no soportada".into());
    }
    if package.vault_b64.trim().is_empty() {
        return Err("Backup vacío o corrupto".into());
    }
    Ok(package)
}

pub fn restore_package(app_data_dir: &Path, package: &BackupPackage) -> Result<(), String> {
    let vault_bytes = B64
        .decode(&package.vault_b64)
        .map_err(|_| "Backup corrupto (vault)".to_string())?;
    fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    fs::write(vault::vault_path(app_data_dir), vault_bytes).map_err(|e| e.to_string())?;
    profile::save(app_data_dir, &package.profile)?;
    Ok(())
}

pub fn default_backup_name(hostname: &str) -> String {
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let host = hostname
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect::<String>();
    format!("PlayerPass-{host}-{stamp}.playerpass")
}
