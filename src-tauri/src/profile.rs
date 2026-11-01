use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    #[serde(default)]
    pub display_name: String,
    #[serde(default = "default_locale")]
    pub locale: String,
    /// "dark" | "light"
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Minutos de inactividad antes de bloquear el vault (1–240). Default 10.
    #[serde(default = "default_auto_lock_minutes")]
    pub auto_lock_minutes: u32,
    /// Segundos hasta limpiar el portapapeles tras copiar (5–300). Default 25.
    #[serde(default = "default_clipboard_clear_seconds")]
    pub clipboard_clear_seconds: u32,
    /// Al abrir la app, buscar e instalar updates automáticamente. Default true.
    #[serde(default = "default_auto_check_updates")]
    pub auto_check_updates: bool,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            display_name: String::new(),
            locale: default_locale(),
            theme: default_theme(),
            auto_lock_minutes: default_auto_lock_minutes(),
            clipboard_clear_seconds: default_clipboard_clear_seconds(),
            auto_check_updates: default_auto_check_updates(),
        }
    }
}

fn default_locale() -> String {
    "es".into()
}

fn default_theme() -> String {
    "dark".into()
}

fn default_auto_lock_minutes() -> u32 {
    10
}

fn default_clipboard_clear_seconds() -> u32 {
    25
}

fn default_auto_check_updates() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsInput {
    pub theme: Option<String>,
    pub auto_lock_minutes: Option<u32>,
    pub clipboard_clear_seconds: Option<u32>,
    pub auto_check_updates: Option<bool>,
}

fn profile_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("profile.json")
}

pub fn load(app_data_dir: &Path) -> Profile {
    let path = profile_path(app_data_dir);
    if !path.exists() {
        return Profile::default();
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save(app_data_dir: &Path, profile: &Profile) -> Result<(), String> {
    if let Some(parent) = profile_path(app_data_dir).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(profile).map_err(|e| e.to_string())?;
    fs::write(profile_path(app_data_dir), json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_display_name(app_data_dir: &Path, name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("El nombre no puede estar vacío".into());
    }
    let mut profile = load(app_data_dir);
    profile.display_name = trimmed.to_string();
    if profile.locale.trim().is_empty() {
        profile.locale = default_locale();
    }
    save(app_data_dir, &profile)
}

pub fn set_locale(app_data_dir: &Path, locale: &str) -> Result<(), String> {
    let normalized = match locale.trim().to_lowercase().as_str() {
        "en" | "en-us" | "en-gb" => "en".to_string(),
        _ => "es".to_string(),
    };
    let mut profile = load(app_data_dir);
    profile.locale = normalized;
    save(app_data_dir, &profile)
}

pub fn update_settings(app_data_dir: &Path, input: SettingsInput) -> Result<Profile, String> {
    let mut profile = load(app_data_dir);
    if let Some(theme) = input.theme {
        profile.theme = match theme.trim().to_lowercase().as_str() {
            "light" => "light".into(),
            _ => "dark".into(),
        };
    }
    if let Some(mins) = input.auto_lock_minutes {
        if !(1..=240).contains(&mins) {
            return Err("autoLockMinutes debe estar entre 1 y 240".into());
        }
        profile.auto_lock_minutes = mins;
    }
    if let Some(secs) = input.clipboard_clear_seconds {
        if !(5..=300).contains(&secs) {
            return Err("clipboardClearSeconds debe estar entre 5 y 300".into());
        }
        profile.clipboard_clear_seconds = secs;
    }
    if let Some(auto) = input.auto_check_updates {
        profile.auto_check_updates = auto;
    }
    if profile.locale.trim().is_empty() {
        profile.locale = default_locale();
    }
    save(app_data_dir, &profile)?;
    Ok(profile)
}
