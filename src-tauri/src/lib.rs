mod backup;
mod cloud;
mod discord;
mod oauth;
mod profile;
mod rate_limit;
mod recovery;
mod secrets;
mod tokens;
mod vault;

use arboard::Clipboard;
use std::{
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use vault::{Account, AccountInput, UnlockedVault};

struct AppState {
    vault: Mutex<Option<UnlockedVault>>,
}

fn data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo resolver el directorio de datos: {e}"))
}

fn require_unlocked<'a>(
    guard: &'a mut Option<UnlockedVault>,
) -> Result<&'a mut UnlockedVault, String> {
    guard
        .as_mut()
        .ok_or_else(|| "El vault está bloqueado".to_string())
}

fn require_unlocked_ref<'a>(
    guard: &'a Option<UnlockedVault>,
) -> Result<&'a UnlockedVault, String> {
    guard
        .as_ref()
        .ok_or_else(|| "El vault está bloqueado".to_string())
}

fn hostname() -> String {
    whoami::fallible::hostname().unwrap_or_else(|_| "desconocido".into())
}

fn set_clipboard_ephemeral(text: String, clear_after_secs: u64) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard: {e}"))?;
    clipboard
        .set_text(text.clone())
        .map_err(|e| format!("No se pudo copiar: {e}"))?;
    // Solo limpia si el contenido sigue siendo el que copió PlayerPass.
    let secs = clear_after_secs.clamp(5, 300);
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(secs));
        if let Ok(mut clip) = Clipboard::new() {
            if clip.get_text().ok().as_deref() == Some(text.as_str()) {
                let _ = clip.set_text(String::new());
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn vault_exists(app: AppHandle) -> Result<bool, String> {
    let dir = data_dir(&app)?;
    Ok(vault::vault_exists(&vault::vault_path(&dir)))
}

#[tauri::command]
fn get_profile(app: AppHandle) -> Result<profile::Profile, String> {
    Ok(profile::load(&data_dir(&app)?))
}

#[tauri::command]
fn set_locale(app: AppHandle, locale: String) -> Result<(), String> {
    profile::set_locale(&data_dir(&app)?, &locale)
}

#[tauri::command]
fn update_settings(
    app: AppHandle,
    input: profile::SettingsInput,
) -> Result<profile::Profile, String> {
    profile::update_settings(&data_dir(&app)?, input)
}

#[tauri::command]
fn create_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    password: String,
    display_name: String,
) -> Result<Vec<Account>, String> {
    let dir = data_dir(&app)?;
    profile::set_display_name(&dir, &display_name)?;
    let path = vault::vault_path(&dir);
    let unlocked = vault::create_vault(&path, &password).map_err(String::from)?;
    let accounts = vault::list_accounts(&unlocked);
    *state.vault.lock().map_err(|_| "Estado bloqueado")? = Some(unlocked);
    Ok(accounts)
}

#[tauri::command]
fn unlock_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    password: String,
) -> Result<Vec<Account>, String> {
    let dir = data_dir(&app)?;
    rate_limit::check(&dir, "unlock")?;
    let path = vault::vault_path(&dir);
    if !path.exists() {
        return Err("No existe un vault. Crea uno primero.".into());
    }
    match vault::unlock_vault(&path, &password) {
        Ok(mut unlocked) => {
            rate_limit::register_success(&dir, "unlock")?;
            if vault::purge_expired_trash(&mut unlocked) {
                let _ = vault::save_unlocked(&path, &unlocked);
            }
            let accounts = vault::list_accounts(&unlocked);
            *state.vault.lock().map_err(|_| "Estado bloqueado")? = Some(unlocked);
            Ok(accounts)
        }
        Err(err) => {
            let _ = rate_limit::register_failure(&dir, "unlock", 5);
            Err(err.into())
        }
    }
}

#[tauri::command]
fn lock_vault(state: State<'_, AppState>) -> Result<(), String> {
    *state.vault.lock().map_err(|_| "Estado bloqueado")? = None;
    Ok(())
}

#[tauri::command]
fn list_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    let guard = state.vault.lock().map_err(|_| "Estado bloqueado")?;
    let vault = require_unlocked_ref(&guard)?;
    Ok(vault::list_accounts(vault))
}

#[tauri::command]
fn add_account(
    app: AppHandle,
    state: State<'_, AppState>,
    input: AccountInput,
) -> Result<Account, String> {
    let path = vault::vault_path(&data_dir(&app)?);
    let mut guard = state.vault.lock().map_err(|_| "Estado bloqueado")?;
    let unlocked = require_unlocked(&mut guard)?;
    let account = vault::add_account(unlocked, input).map_err(String::from)?;
    vault::save_unlocked(&path, unlocked).map_err(String::from)?;
    Ok(account)
}

#[tauri::command]
fn update_account(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    input: AccountInput,
) -> Result<Account, String> {
    let path = vault::vault_path(&data_dir(&app)?);
    let mut guard = state.vault.lock().map_err(|_| "Estado bloqueado")?;
    let unlocked = require_unlocked(&mut guard)?;
    let account = vault::update_account(unlocked, &id, input).map_err(String::from)?;
    vault::save_unlocked(&path, unlocked).map_err(String::from)?;
    Ok(account)
}

#[tauri::command]
fn delete_account(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Account, String> {
    let path = vault::vault_path(&data_dir(&app)?);
    let mut guard = state.vault.lock().map_err(|_| "Estado bloqueado")?;
    let unlocked = require_unlocked(&mut guard)?;
    let account = vault::trash_account(unlocked, &id).map_err(String::from)?;
    vault::save_unlocked(&path, unlocked).map_err(String::from)?;
    Ok(account)
}

#[tauri::command]
fn restore_account(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Account, String> {
    let path = vault::vault_path(&data_dir(&app)?);
    let mut guard = state.vault.lock().map_err(|_| "Estado bloqueado")?;
    let unlocked = require_unlocked(&mut guard)?;
    let account = vault::restore_account(unlocked, &id).map_err(String::from)?;
    vault::save_unlocked(&path, unlocked).map_err(String::from)?;
    Ok(account)
}

#[tauri::command]
fn purge_account(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let path = vault::vault_path(&data_dir(&app)?);
    let mut guard = state.vault.lock().map_err(|_| "Estado bloqueado")?;
    let unlocked = require_unlocked(&mut guard)?;
    vault::purge_account(unlocked, &id).map_err(String::from)?;
    vault::save_unlocked(&path, unlocked).map_err(String::from)?;
    Ok(())
}

#[tauri::command]
fn empty_trash(app: AppHandle, state: State<'_, AppState>) -> Result<u32, String> {
    let path = vault::vault_path(&data_dir(&app)?);
    let mut guard = state.vault.lock().map_err(|_| "Estado bloqueado")?;
    let unlocked = require_unlocked(&mut guard)?;
    let removed = vault::empty_trash(unlocked);
    if removed > 0 {
        vault::save_unlocked(&path, unlocked).map_err(String::from)?;
    }
    Ok(removed as u32)
}

#[tauri::command]
fn set_favorite(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    favorite: bool,
) -> Result<Account, String> {
    let path = vault::vault_path(&data_dir(&app)?);
    let mut guard = state.vault.lock().map_err(|_| "Estado bloqueado")?;
    let unlocked = require_unlocked(&mut guard)?;
    let account = vault::set_favorite(unlocked, &id, favorite).map_err(String::from)?;
    vault::save_unlocked(&path, unlocked).map_err(String::from)?;
    Ok(account)
}

/// Solo con vault desbloqueado — evita abuso del clipboard con la app bloqueada.
#[tauri::command]
fn copy_to_clipboard(app: AppHandle, state: State<'_, AppState>, text: String) -> Result<(), String> {
    let guard = state.vault.lock().map_err(|_| "Estado bloqueado")?;
    let _ = require_unlocked_ref(&guard)?;
    if text.len() > 4096 {
        return Err("Texto demasiado largo para copiar".into());
    }
    let secs = profile::load(&data_dir(&app)?).clipboard_clear_seconds as u64;
    set_clipboard_ephemeral(text, secs)
}

#[tauri::command]
fn get_app_config() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "discordInviteUrl": secrets::DISCORD_INVITE_URL,
        "googleConfigured": !secrets::GOOGLE_OAUTH_CLIENT_ID.trim().is_empty()
            && !secrets::GOOGLE_OAUTH_CLIENT_ID.contains("REEMPLAZA"),
        "microsoftConfigured": !secrets::MICROSOFT_OAUTH_CLIENT_ID.trim().is_empty()
            && !secrets::MICROSOFT_OAUTH_CLIENT_ID.contains("REEMPLAZA"),
    }))
}

#[tauri::command]
fn export_backup_local(app: AppHandle) -> Result<String, String> {
    let dir = data_dir(&app)?;
    let package = backup::build_package(&dir, &hostname())?;
    let bytes = backup::package_to_bytes(&package)?;
    let suggested = backup::default_backup_name(&hostname());
    let path = rfd::FileDialog::new()
        .set_file_name(&suggested)
        .add_filter("PlayerPass backup", &["playerpass"])
        .save_file()
        .ok_or_else(|| "Exportación cancelada".to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn import_backup_local(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let path = rfd::FileDialog::new()
        .add_filter("PlayerPass backup", &["playerpass", "json"])
        .pick_file()
        .ok_or_else(|| "Importación cancelada".to_string())?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let package = backup::package_from_bytes(&bytes)?;
    let dir = data_dir(&app)?;
    backup::restore_package(&dir, &package)?;
    *state.vault.lock().map_err(|_| "Estado bloqueado")? = None;
    Ok(())
}

#[tauri::command]
fn cloud_backup(app: AppHandle, provider: String) -> Result<String, String> {
    let dir = data_dir(&app)?;
    let provider = cloud::Provider::parse(&provider)?;
    cloud::backup_to_cloud(provider, &dir, &hostname())
}

#[tauri::command]
fn send_backup_discord(app: AppHandle) -> Result<String, String> {
    let dir = data_dir(&app)?;
    let host = hostname();
    let package = backup::build_package(&dir, &host)?;
    let bytes = backup::package_to_bytes(&package)?;
    let filename = backup::default_backup_name(&host);
    let display_name = package.profile.display_name.clone();
    discord::send_backup_file(&host, &display_name, &filename, &bytes)?;
    Ok(filename)
}

#[tauri::command]
fn cloud_list_backups(
    app: AppHandle,
    provider: String,
) -> Result<Vec<backup::CloudBackupItem>, String> {
    let dir = data_dir(&app)?;
    let provider = cloud::Provider::parse(&provider)?;
    cloud::list_cloud_backups(provider, &dir)
}

#[tauri::command]
fn cloud_restore_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    provider: String,
    file_id: String,
) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let provider = cloud::Provider::parse(&provider)?;
    cloud::restore_from_cloud(provider, &dir, &file_id)?;
    *state.vault.lock().map_err(|_| "Estado bloqueado")? = None;
    Ok(())
}

/// Genera OTP y lo manda SOLO a Discord. No se devuelve al frontend.
#[tauri::command]
fn request_password_recovery(app: AppHandle, contact: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    rate_limit::check(&dir, "recovery_request")?;
    let code = recovery::create_challenge(&dir)?;
    match discord::notify_recovery_request(&hostname(), &contact, &code) {
        Ok(()) => {
            rate_limit::register_success(&dir, "recovery_request")?;
            Ok(())
        }
        Err(err) => {
            // No dejes un OTP huérfano si Discord no lo recibió.
            recovery::clear_challenge(&dir);
            let _ = rate_limit::register_failure(&dir, "recovery_request", 3);
            Err(err)
        }
    }
}

#[tauri::command]
fn reset_master_password(
    app: AppHandle,
    state: State<'_, AppState>,
    recovery_code: String,
    new_password: String,
) -> Result<Vec<Account>, String> {
    let dir = data_dir(&app)?;
    rate_limit::check(&dir, "recovery_reset")?;
    let path = vault::vault_path(&dir);
    if !path.exists() {
        return Err("No existe un vault".into());
    }

    // 1) Valida el OTP de Discord (sin consumirlo todavía).
    if let Err(err) = recovery::verify_challenge(&dir, &recovery_code) {
        let _ = rate_limit::register_failure(&dir, "recovery_reset", 5);
        return Err(err);
    }

    // 2) El OTP autoriza el reset; el unwrap usa el secreto de build (con migración).
    match vault::reset_master_password(&path, &new_password) {
        Ok(unlocked) => {
            recovery::clear_challenge(&dir);
            rate_limit::register_success(&dir, "recovery_reset")?;
            let accounts = vault::list_accounts(&unlocked);
            let _ = discord::notify_password_reset(&hostname());
            *state.vault.lock().map_err(|_| "Estado bloqueado")? = Some(unlocked);
            Ok(accounts)
        }
        Err(err) => {
            let _ = rate_limit::register_failure(&dir, "recovery_reset", 5);
            Err(err.into())
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .manage(AppState {
            vault: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            vault_exists,
            get_profile,
            set_locale,
            update_settings,
            create_vault,
            unlock_vault,
            lock_vault,
            list_accounts,
            add_account,
            update_account,
            delete_account,
            restore_account,
            purge_account,
            empty_trash,
            set_favorite,
            copy_to_clipboard,
            get_app_config,
            request_password_recovery,
            reset_master_password,
            export_backup_local,
            import_backup_local,
            cloud_backup,
            send_backup_discord,
            cloud_list_backups,
            cloud_restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
