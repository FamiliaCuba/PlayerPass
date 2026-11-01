use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::Utc;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use thiserror::Error;
use uuid::Uuid;
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::secrets::ADMIN_RECOVERY_CODE;

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

#[derive(Debug, Error)]
pub enum VaultError {
    #[error("{0}")]
    Message(String),
    #[error("I/O: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),
}

impl From<VaultError> for String {
    fn from(value: VaultError) -> Self {
        value.to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    #[serde(default = "default_platform")]
    pub platform: String,
    pub game: String,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub has_multiplayer: bool,
    #[serde(default)]
    pub account_name: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub shadow_until: Option<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub updated_at: String,
    /// Soft-delete: si está presente, la cuenta está en la papelera.
    #[serde(default)]
    pub deleted_at: Option<String>,
    #[serde(default)]
    pub favorite: bool,
}

fn default_platform() -> String {
    "other".into()
}

fn default_status() -> String {
    "active".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct VaultData {
    accounts: Vec<Account>,
}

#[derive(Debug, Serialize, Deserialize)]
struct RecoveryWrap {
    salt: String,
    nonce: String,
    wrapped_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct VaultFile {
    version: u32,
    salt: String,
    nonce: String,
    ciphertext: String,
    #[serde(default)]
    recovery: Option<RecoveryWrap>,
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct VaultKey([u8; KEY_LEN]);

impl VaultKey {
    fn as_bytes(&self) -> &[u8; KEY_LEN] {
        &self.0
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self, VaultError> {
        if bytes.len() != KEY_LEN {
            return Err(VaultError::Message("Clave inválida".into()));
        }
        let mut key = [0u8; KEY_LEN];
        key.copy_from_slice(bytes);
        Ok(VaultKey(key))
    }
}

pub struct UnlockedVault {
    pub key: VaultKey,
    pub data: VaultData,
}

fn argon2_params(memory_kib: u32, iterations: u32) -> Argon2<'static> {
    let params =
        Params::new(memory_kib, iterations, 1, Some(KEY_LEN)).expect("valid argon2 params");
    Argon2::new(argon2::Algorithm::Argon2id, Version::V0x13, params)
}

fn derive_key_with(
    password: &str,
    salt_bytes: &[u8],
    memory_kib: u32,
    iterations: u32,
) -> Result<VaultKey, VaultError> {
    let mut key = [0u8; KEY_LEN];
    argon2_params(memory_kib, iterations)
        .hash_password_into(password.as_bytes(), salt_bytes, &mut key)
        .map_err(|e| VaultError::Message(format!("No se pudo derivar la clave: {e}")))?;
    Ok(VaultKey(key))
}

fn derive_key(password: &str, salt_bytes: &[u8]) -> Result<VaultKey, VaultError> {
    derive_key_with(password, salt_bytes, 65_536, 3)
}

/// Códigos admin de builds anteriores (migración de recuperación).
const LEGACY_ADMIN_RECOVERY_CODES: &[&str] = &["PP-ADMIN-7K9M-X4WQ-2NPH"];

/// Params Argon2 usados en builds anteriores.
const LEGACY_ARGON_PARAMS: &[(u32, u32)] = &[(19_456, 2)];

fn encrypt(key: &VaultKey, plaintext: &[u8]) -> Result<(Vec<u8>, [u8; NONCE_LEN]), VaultError> {
    let cipher = Aes256Gcm::new_from_slice(key.as_bytes())
        .map_err(|e| VaultError::Message(format!("Cipher: {e}")))?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| VaultError::Message("Error al cifrar el vault".into()))?;
    Ok((ciphertext, nonce_bytes))
}

fn decrypt(key: &VaultKey, nonce_bytes: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, VaultError> {
    let cipher = Aes256Gcm::new_from_slice(key.as_bytes())
        .map_err(|e| VaultError::Message(format!("Cipher: {e}")))?;
    if nonce_bytes.len() != NONCE_LEN {
        return Err(VaultError::Message("Nonce inválido".into()));
    }
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| VaultError::Message("Contraseña incorrecta o vault corrupto".into()))
}

fn wrap_key_for_recovery(vault_key: &VaultKey) -> Result<RecoveryWrap, VaultError> {
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    let recovery_key = derive_key(ADMIN_RECOVERY_CODE, &salt)?;
    let (wrapped, nonce) = encrypt(&recovery_key, vault_key.as_bytes())?;
    Ok(RecoveryWrap {
        salt: B64.encode(salt),
        nonce: B64.encode(nonce),
        wrapped_key: B64.encode(wrapped),
    })
}

fn try_unwrap_recovery(
    wrap: &RecoveryWrap,
    code: &str,
    memory_kib: u32,
    iterations: u32,
) -> Result<VaultKey, VaultError> {
    let salt = B64
        .decode(&wrap.salt)
        .map_err(|_| VaultError::Message("Recovery salt corrupto".into()))?;
    let nonce = B64
        .decode(&wrap.nonce)
        .map_err(|_| VaultError::Message("Recovery nonce corrupto".into()))?;
    let wrapped = B64
        .decode(&wrap.wrapped_key)
        .map_err(|_| VaultError::Message("Recovery key corrupta".into()))?;
    let recovery_key = derive_key_with(code, &salt, memory_kib, iterations)?;
    let raw = decrypt(&recovery_key, &nonce, &wrapped)
        .map_err(|_| VaultError::Message("unwrap fail".into()))?;
    VaultKey::from_bytes(&raw)
}

fn admin_recovery_candidates() -> Vec<&'static str> {
    let mut codes = vec![ADMIN_RECOVERY_CODE];
    for code in LEGACY_ADMIN_RECOVERY_CODES {
        if *code != ADMIN_RECOVERY_CODE {
            codes.push(*code);
        }
    }
    codes
}

fn argon_param_candidates() -> Vec<(u32, u32)> {
    let mut params = vec![(65_536, 3)];
    for pair in LEGACY_ARGON_PARAMS {
        if *pair != (65_536, 3) {
            params.push(*pair);
        }
    }
    params
}

fn unwrap_key_with_recovery(wrap: &RecoveryWrap) -> Result<VaultKey, VaultError> {
    for code in admin_recovery_candidates() {
        for (memory_kib, iterations) in argon_param_candidates() {
            if let Ok(key) = try_unwrap_recovery(wrap, code, memory_kib, iterations) {
                return Ok(key);
            }
        }
    }
    Err(VaultError::Message(
        "No se pudo abrir la recuperación del vault (secreto de build distinto). Desbloquéalo una vez con la contraseña actual para migrar, o restaura un backup.".into(),
    ))
}

pub fn vault_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("vault.enc")
}

pub fn vault_exists(path: &Path) -> bool {
    path.exists()
}

pub fn create_vault(path: &Path, password: &str) -> Result<UnlockedVault, VaultError> {
    if password.trim().len() < 8 {
        return Err(VaultError::Message(
            "La contraseña maestra debe tener al menos 8 caracteres".into(),
        ));
    }
    if path.exists() {
        return Err(VaultError::Message("Ya existe un vault".into()));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    let key = derive_key(password, &salt)?;
    let data = VaultData::default();
    persist(path, &key, &salt, &data)?;
    Ok(UnlockedVault { key, data })
}

fn read_vault_file(path: &Path) -> Result<VaultFile, VaultError> {
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn unlock_vault(path: &Path, password: &str) -> Result<UnlockedVault, VaultError> {
    let file = read_vault_file(path)?;
    if file.version != 1 && file.version != 2 {
        return Err(VaultError::Message("Versión de vault no soportada".into()));
    }
    let salt = B64
        .decode(&file.salt)
        .map_err(|_| VaultError::Message("Salt corrupto".into()))?;
    let nonce = B64
        .decode(&file.nonce)
        .map_err(|_| VaultError::Message("Nonce corrupto".into()))?;
    let ciphertext = B64
        .decode(&file.ciphertext)
        .map_err(|_| VaultError::Message("Ciphertext corrupto".into()))?;

    let mut unlocked: Option<(VaultKey, VaultData, bool)> = None;
    for (memory_kib, iterations) in argon_param_candidates() {
        if let Ok(key) = derive_key_with(password, &salt, memory_kib, iterations) {
            if let Ok(plaintext) = decrypt(&key, &nonce, &ciphertext) {
                if let Ok(data) = serde_json::from_slice::<VaultData>(&plaintext) {
                    let used_legacy = (memory_kib, iterations) != (65_536, 3);
                    unlocked = Some((key, data, used_legacy));
                    break;
                }
            }
        }
    }
    let (key, data, used_legacy) = unlocked.ok_or_else(|| {
        VaultError::Message("Contraseña incorrecta o vault corrupto".into())
    })?;

    // Migra Argon2 / recovery wrap al secreto y params actuales.
    if used_legacy {
        let mut new_salt = [0u8; SALT_LEN];
        rand::thread_rng().fill_bytes(&mut new_salt);
        let new_key = derive_key(password, &new_salt)?;
        persist(path, &new_key, &new_salt, &data)?;
        Ok(UnlockedVault {
            key: new_key,
            data,
        })
    } else {
        persist(path, &key, &salt, &data)?;
        Ok(UnlockedVault { key, data })
    }
}

fn persist(
    path: &Path,
    key: &VaultKey,
    salt: &[u8],
    data: &VaultData,
) -> Result<(), VaultError> {
    let plaintext = serde_json::to_vec(data)?;
    let (ciphertext, nonce) = encrypt(key, &plaintext)?;
    let file = VaultFile {
        version: 2,
        salt: B64.encode(salt),
        nonce: B64.encode(nonce),
        ciphertext: B64.encode(ciphertext),
        recovery: Some(wrap_key_for_recovery(key)?),
    };
    let json = serde_json::to_string_pretty(&file)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, json)?;
    Ok(())
}

fn read_salt(path: &Path) -> Result<Vec<u8>, VaultError> {
    let file = read_vault_file(path)?;
    B64.decode(file.salt)
        .map_err(|_| VaultError::Message("Salt corrupto".into()))
}

pub fn save_unlocked(path: &Path, vault: &UnlockedVault) -> Result<(), VaultError> {
    let salt = read_salt(path)?;
    persist(path, &vault.key, &salt, &vault.data)
}

/// Tras validar el OTP de Discord, abre el vault con el secreto de build y pone nueva maestra.
pub fn reset_master_password(path: &Path, new_password: &str) -> Result<UnlockedVault, VaultError> {
    if new_password.trim().len() < 8 {
        return Err(VaultError::Message(
            "La nueva contraseña debe tener al menos 8 caracteres".into(),
        ));
    }
    let file = read_vault_file(path)?;
    let wrap = file
        .recovery
        .as_ref()
        .ok_or_else(|| VaultError::Message(
            "Este vault no tiene recuperación. Desbloquéalo una vez con la contraseña actual o crea uno nuevo.".into(),
        ))?;

    let key = unwrap_key_with_recovery(wrap)?;
    let nonce = B64
        .decode(&file.nonce)
        .map_err(|_| VaultError::Message("Nonce corrupto".into()))?;
    let ciphertext = B64
        .decode(&file.ciphertext)
        .map_err(|_| VaultError::Message("Ciphertext corrupto".into()))?;
    let plaintext = decrypt(&key, &nonce, &ciphertext)?;
    let data: VaultData = serde_json::from_slice(&plaintext)?;

    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    let new_key = derive_key(new_password, &salt)?;
    persist(path, &new_key, &salt, &data)?;
    Ok(UnlockedVault {
        key: new_key,
        data,
    })
}

pub fn list_accounts(vault: &UnlockedVault) -> Vec<Account> {
    let mut accounts = vault.data.accounts.clone();
    accounts.sort_by(|a, b| {
        b.favorite
            .cmp(&a.favorite)
            .then_with(|| {
                a.game
                    .to_lowercase()
                    .cmp(&b.game.to_lowercase())
            })
            .then_with(|| a.username.to_lowercase().cmp(&b.username.to_lowercase()))
    });
    accounts
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    #[serde(default = "default_platform")]
    pub platform: String,
    pub game: String,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub has_multiplayer: bool,
    #[serde(default)]
    pub account_name: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub shadow_days: Option<u32>,
    #[serde(default)]
    pub notes: String,
}

fn normalize_status(status: &str) -> String {
    match status.trim().to_lowercase().as_str() {
        "shadow" => "shadow".into(),
        "banned" => "banned".into(),
        _ => "active".into(),
    }
}

fn shadow_until_from(status: &str, shadow_days: Option<u32>) -> Option<String> {
    if status != "shadow" {
        return None;
    }
    let days = match shadow_days {
        Some(7) | Some(14) => shadow_days.unwrap(),
        _ => 7,
    };
    Some((Utc::now() + chrono::Duration::days(days as i64)).to_rfc3339())
}

pub fn add_account(vault: &mut UnlockedVault, input: AccountInput) -> Result<Account, VaultError> {
    if input.game.trim().is_empty() || input.username.trim().is_empty() {
        return Err(VaultError::Message(
            "Juego y usuario son obligatorios".into(),
        ));
    }
    let status = normalize_status(&input.status);
    let account = Account {
        id: Uuid::new_v4().to_string(),
        platform: input.platform.trim().to_lowercase(),
        game: input.game.trim().to_string(),
        username: input.username.trim().to_string(),
        password: input.password,
        has_multiplayer: input.has_multiplayer,
        account_name: input.account_name.trim().to_string(),
        status: status.clone(),
        shadow_until: shadow_until_from(&status, input.shadow_days),
        notes: input.notes,
        tags: Vec::new(),
        updated_at: Utc::now().to_rfc3339(),
        deleted_at: None,
        favorite: false,
    };
    vault.data.accounts.push(account.clone());
    Ok(account)
}

pub fn update_account(
    vault: &mut UnlockedVault,
    id: &str,
    input: AccountInput,
) -> Result<Account, VaultError> {
    if input.game.trim().is_empty() || input.username.trim().is_empty() {
        return Err(VaultError::Message(
            "Juego y usuario son obligatorios".into(),
        ));
    }
    let account = vault
        .data
        .accounts
        .iter_mut()
        .find(|a| a.id == id)
        .ok_or_else(|| VaultError::Message("Cuenta no encontrada".into()))?;
    let status = normalize_status(&input.status);
    let keep_until = account.shadow_until.clone();
    account.platform = input.platform.trim().to_lowercase();
    account.game = input.game.trim().to_string();
    account.username = input.username.trim().to_string();
    account.password = input.password;
    account.has_multiplayer = input.has_multiplayer;
    account.account_name = input.account_name.trim().to_string();
    account.status = status.clone();
    account.shadow_until = if status == "shadow" {
        if input.shadow_days.is_some() {
            shadow_until_from(&status, input.shadow_days)
        } else {
            keep_until.or_else(|| shadow_until_from(&status, Some(7)))
        }
    } else {
        None
    };
    account.notes = input.notes;
    account.updated_at = Utc::now().to_rfc3339();
    Ok(account.clone())
}

const TRASH_DAYS: i64 = 7;

/// Elimina de la papelera lo que lleva más de 7 días. Devuelve true si hubo cambios.
pub fn purge_expired_trash(vault: &mut UnlockedVault) -> bool {
    let cutoff = Utc::now() - chrono::Duration::days(TRASH_DAYS);
    let before = vault.data.accounts.len();
    vault.data.accounts.retain(|a| match &a.deleted_at {
        None => true,
        Some(ts) => chrono::DateTime::parse_from_rfc3339(ts)
            .map(|dt| dt.with_timezone(&Utc) > cutoff)
            .unwrap_or(false),
    });
    vault.data.accounts.len() != before
}

/// Mueve a la papelera (7 días).
pub fn trash_account(vault: &mut UnlockedVault, id: &str) -> Result<Account, VaultError> {
    let account = vault
        .data
        .accounts
        .iter_mut()
        .find(|a| a.id == id)
        .ok_or_else(|| VaultError::Message("Cuenta no encontrada".into()))?;
    if account.deleted_at.is_some() {
        return Err(VaultError::Message("La cuenta ya está en la papelera".into()));
    }
    account.deleted_at = Some(Utc::now().to_rfc3339());
    account.updated_at = Utc::now().to_rfc3339();
    Ok(account.clone())
}

pub fn restore_account(vault: &mut UnlockedVault, id: &str) -> Result<Account, VaultError> {
    let account = vault
        .data
        .accounts
        .iter_mut()
        .find(|a| a.id == id)
        .ok_or_else(|| VaultError::Message("Cuenta no encontrada".into()))?;
    account.deleted_at = None;
    account.updated_at = Utc::now().to_rfc3339();
    Ok(account.clone())
}

pub fn purge_account(vault: &mut UnlockedVault, id: &str) -> Result<(), VaultError> {
    let before = vault.data.accounts.len();
    vault.data.accounts.retain(|a| a.id != id);
    if vault.data.accounts.len() == before {
        return Err(VaultError::Message("Cuenta no encontrada".into()));
    }
    Ok(())
}

/// Elimina de golpe todas las cuentas en papelera. Devuelve cuántas se borraron.
pub fn empty_trash(vault: &mut UnlockedVault) -> usize {
    let before = vault.data.accounts.len();
    vault.data.accounts.retain(|a| a.deleted_at.is_none());
    before - vault.data.accounts.len()
}

pub fn set_favorite(
    vault: &mut UnlockedVault,
    id: &str,
    favorite: bool,
) -> Result<Account, VaultError> {
    let account = vault
        .data
        .accounts
        .iter_mut()
        .find(|a| a.id == id)
        .ok_or_else(|| VaultError::Message("Cuenta no encontrada".into()))?;
    account.favorite = favorite;
    account.updated_at = Utc::now().to_rfc3339();
    Ok(account.clone())
}
