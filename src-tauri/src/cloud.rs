use crate::backup::{self, CloudBackupItem};
use crate::oauth::{self, Pkce, TokenResponse};
use crate::secrets::{GOOGLE_OAUTH_CLIENT_ID, MICROSOFT_OAUTH_CLIENT_ID};
use crate::tokens::{self, StoredTokens};
use serde_json::Value;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Google,
    OneDrive,
}

impl Provider {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s.trim().to_lowercase().as_str() {
            "google" | "gdrive" | "drive" => Ok(Self::Google),
            "onedrive" | "microsoft" | "ms" => Ok(Self::OneDrive),
            _ => Err("Proveedor inválido (usa google u onedrive)".into()),
        }
    }
}

fn require_client_id(provider: Provider) -> Result<&'static str, String> {
    let id = match provider {
        Provider::Google => GOOGLE_OAUTH_CLIENT_ID.trim(),
        Provider::OneDrive => MICROSOFT_OAUTH_CLIENT_ID.trim(),
    };
    if id.is_empty() || id.contains("REEMPLAZA") {
        return Err(match provider {
            Provider::Google => {
                "Falta GOOGLE_OAUTH_CLIENT_ID en secrets/local.rs (Google Cloud Console → OAuth Desktop)".into()
            }
            Provider::OneDrive => {
                "Falta MICROSOFT_OAUTH_CLIENT_ID en secrets/local.rs (Azure App Registration)".into()
            }
        });
    }
    Ok(id)
}

fn open_browser(url: &str) -> Result<(), String> {
    open::that(url).map_err(|e| format!("No se pudo abrir el navegador: {e}"))
}

fn google_authorize(pkce: &Pkce, client_id: &str) -> Result<(), String> {
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        urlencoding::encode(client_id),
        urlencoding::encode(oauth::OAUTH_REDIRECT),
        urlencoding::encode("https://www.googleapis.com/auth/drive.file"),
        urlencoding::encode(&pkce.state),
        urlencoding::encode(&pkce.challenge),
    );
    open_browser(&url)
}

fn microsoft_authorize(pkce: &Pkce, client_id: &str) -> Result<(), String> {
    let url = format!(
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?\
client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&prompt=select_account",
        urlencoding::encode(client_id),
        urlencoding::encode(oauth::OAUTH_REDIRECT),
        urlencoding::encode("offline_access Files.ReadWrite.AppFolder"),
        urlencoding::encode(&pkce.state),
        urlencoding::encode(&pkce.challenge),
    );
    open_browser(&url)
}

fn exchange_google(client_id: &str, code: &str, verifier: &str) -> Result<TokenResponse, String> {
    oauth::post_form(
        "https://oauth2.googleapis.com/token",
        &[
            ("client_id", client_id),
            ("code", code),
            ("code_verifier", verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", oauth::OAUTH_REDIRECT),
        ],
    )
}

fn exchange_microsoft(
    client_id: &str,
    code: &str,
    verifier: &str,
) -> Result<TokenResponse, String> {
    oauth::post_form(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        &[
            ("client_id", client_id),
            ("code", code),
            ("code_verifier", verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", oauth::OAUTH_REDIRECT),
            ("scope", "offline_access Files.ReadWrite.AppFolder"),
        ],
    )
}

fn refresh_google(client_id: &str, refresh: &str) -> Result<TokenResponse, String> {
    oauth::post_form(
        "https://oauth2.googleapis.com/token",
        &[
            ("client_id", client_id),
            ("refresh_token", refresh),
            ("grant_type", "refresh_token"),
        ],
    )
}

fn refresh_microsoft(client_id: &str, refresh: &str) -> Result<TokenResponse, String> {
    oauth::post_form(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        &[
            ("client_id", client_id),
            ("refresh_token", refresh),
            ("grant_type", "refresh_token"),
            ("scope", "offline_access Files.ReadWrite.AppFolder"),
        ],
    )
}

fn interactive_login(provider: Provider, app_data_dir: &Path) -> Result<String, String> {
    let client_id = require_client_id(provider)?;
    let pkce = oauth::generate_pkce();
    match provider {
        Provider::Google => google_authorize(&pkce, client_id)?,
        Provider::OneDrive => microsoft_authorize(&pkce, client_id)?,
    }
    let code = oauth::wait_for_auth_code(&pkce.state)?;
    let tokens = match provider {
        Provider::Google => exchange_google(client_id, &code, &pkce.verifier)?,
        Provider::OneDrive => exchange_microsoft(client_id, &code, &pkce.verifier)?,
    };
    let mut stored = tokens::load(app_data_dir);
    if let Some(refresh) = tokens.refresh_token.clone() {
        match provider {
            Provider::Google => stored.google_refresh = Some(refresh),
            Provider::OneDrive => stored.microsoft_refresh = Some(refresh),
        }
        tokens::save(app_data_dir, &stored)?;
    }
    Ok(tokens.access_token)
}

fn access_token(provider: Provider, app_data_dir: &Path) -> Result<String, String> {
    let client_id = require_client_id(provider)?;
    let stored = tokens::load(app_data_dir);
    let refresh = match provider {
        Provider::Google => stored.google_refresh.clone(),
        Provider::OneDrive => stored.microsoft_refresh.clone(),
    };

    if let Some(refresh) = refresh {
        let refreshed = match provider {
            Provider::Google => refresh_google(client_id, &refresh),
            Provider::OneDrive => refresh_microsoft(client_id, &refresh),
        };
        if let Ok(tokens) = refreshed {
            let mut next = StoredTokens {
                google_refresh: stored.google_refresh,
                microsoft_refresh: stored.microsoft_refresh,
            };
            if let Some(r) = tokens.refresh_token {
                match provider {
                    Provider::Google => next.google_refresh = Some(r),
                    Provider::OneDrive => next.microsoft_refresh = Some(r),
                }
                let _ = tokens::save(app_data_dir, &next);
            }
            return Ok(tokens.access_token);
        }
    }
    interactive_login(provider, app_data_dir)
}

fn ensure_google_folder(access: &str) -> Result<String, String> {
    // Busca carpeta PlayerPass creada por la app.
    let q = "name='PlayerPass' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    let url = format!(
        "https://www.googleapis.com/drive/v3/files?q={}&spaces=drive&fields=files(id,name)",
        urlencoding::encode(q)
    );
    let resp: Value = ureq::get(&url)
        .set("Authorization", &format!("Bearer {access}"))
        .call()
        .map_err(|e| format!("Drive list folder: {e}"))?
        .into_json()
        .map_err(|e| e.to_string())?;
    if let Some(id) = resp["files"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|f| f["id"].as_str())
    {
        return Ok(id.to_string());
    }

    let meta = serde_json::json!({
        "name": "PlayerPass",
        "mimeType": "application/vnd.google-apps.folder"
    });
    let created: Value = ureq::post("https://www.googleapis.com/drive/v3/files")
        .set("Authorization", &format!("Bearer {access}"))
        .set("Content-Type", "application/json")
        .send_json(meta)
        .map_err(|e| format!("Drive create folder: {e}"))?
        .into_json()
        .map_err(|e| e.to_string())?;
    created["id"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No se pudo crear carpeta PlayerPass en Drive".into())
}

fn upload_google(access: &str, filename: &str, bytes: &[u8]) -> Result<(), String> {
    let folder_id = ensure_google_folder(access)?;
    let metadata = serde_json::json!({
        "name": filename,
        "parents": [folder_id]
    });
    let boundary = "playerpass_boundary";
    let mut body = Vec::new();
    body.extend_from_slice(
        format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(metadata.to_string().as_bytes());
    body.extend_from_slice(
        format!("\r\n--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    ureq::post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
        .set("Authorization", &format!("Bearer {access}"))
        .set(
            "Content-Type",
            &format!("multipart/related; boundary={boundary}"),
        )
        .send_bytes(&body)
        .map_err(|e| format!("Drive upload: {e}"))?;
    Ok(())
}

fn list_google(access: &str) -> Result<Vec<CloudBackupItem>, String> {
    let folder_id = ensure_google_folder(access)?;
    let q = format!("'{folder_id}' in parents and trashed=false");
    let url = format!(
        "https://www.googleapis.com/drive/v3/files?q={}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)&pageSize=50",
        urlencoding::encode(&q)
    );
    let resp: Value = ureq::get(&url)
        .set("Authorization", &format!("Bearer {access}"))
        .call()
        .map_err(|e| format!("Drive list: {e}"))?
        .into_json()
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Some(files) = resp["files"].as_array() {
        for f in files {
            let name = f["name"].as_str().unwrap_or("backup");
            if !name.ends_with(".playerpass") {
                continue;
            }
            out.push(CloudBackupItem {
                id: f["id"].as_str().unwrap_or("").to_string(),
                name: name.to_string(),
                modified_at: f["modifiedTime"].as_str().unwrap_or("").to_string(),
            });
        }
    }
    Ok(out)
}

fn download_google_fixed(access: &str, file_id: &str) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let url = format!("https://www.googleapis.com/drive/v3/files/{file_id}?alt=media");
    let resp = ureq::get(&url)
        .set("Authorization", &format!("Bearer {access}"))
        .call()
        .map_err(|e| format!("Drive download: {e}"))?;
    let mut bytes = Vec::new();
    resp.into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

fn upload_onedrive(access: &str, filename: &str, bytes: &[u8]) -> Result<(), String> {
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/drive/special/approot:/PlayerPass/{filename}:/content"
    );
    ureq::put(&url)
        .set("Authorization", &format!("Bearer {access}"))
        .set("Content-Type", "application/octet-stream")
        .send_bytes(bytes)
        .map_err(|e| format!("OneDrive upload: {e}"))?;
    Ok(())
}

fn list_onedrive(access: &str) -> Result<Vec<CloudBackupItem>, String> {
    // Asegura carpeta creando listado; si falla, intenta children de approot/PlayerPass
    let url = "https://graph.microsoft.com/v1.0/me/drive/special/approot:/PlayerPass:/children?$orderby=lastModifiedDateTime desc&$top=50";
    let resp = ureq::get(url)
        .set("Authorization", &format!("Bearer {access}"))
        .call();

    let resp: Value = match resp {
        Ok(r) => r.into_json().map_err(|e| e.to_string())?,
        Err(_) => {
            // Carpeta aún no existe
            return Ok(Vec::new());
        }
    };

    let mut out = Vec::new();
    if let Some(files) = resp["value"].as_array() {
        for f in files {
            let name = f["name"].as_str().unwrap_or("");
            if !name.ends_with(".playerpass") {
                continue;
            }
            out.push(CloudBackupItem {
                id: f["id"].as_str().unwrap_or("").to_string(),
                name: name.to_string(),
                modified_at: f["lastModifiedDateTime"].as_str().unwrap_or("").to_string(),
            });
        }
    }
    Ok(out)
}

fn download_onedrive(access: &str, file_id: &str) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let url = format!("https://graph.microsoft.com/v1.0/me/drive/items/{file_id}/content");
    let resp = ureq::get(&url)
        .set("Authorization", &format!("Bearer {access}"))
        .call()
        .map_err(|e| format!("OneDrive download: {e}"))?;
    let mut bytes = Vec::new();
    resp.into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

pub fn backup_to_cloud(
    provider: Provider,
    app_data_dir: &Path,
    hostname: &str,
) -> Result<String, String> {
    let package = backup::build_package(app_data_dir, hostname)?;
    let bytes = backup::package_to_bytes(&package)?;
    let filename = backup::default_backup_name(hostname);
    let access = access_token(provider, app_data_dir)?;
    match provider {
        Provider::Google => upload_google(&access, &filename, &bytes)?,
        Provider::OneDrive => upload_onedrive(&access, &filename, &bytes)?,
    }
    Ok(filename)
}

pub fn list_cloud_backups(
    provider: Provider,
    app_data_dir: &Path,
) -> Result<Vec<CloudBackupItem>, String> {
    let access = access_token(provider, app_data_dir)?;
    match provider {
        Provider::Google => list_google(&access),
        Provider::OneDrive => list_onedrive(&access),
    }
}

pub fn restore_from_cloud(
    provider: Provider,
    app_data_dir: &Path,
    file_id: &str,
) -> Result<(), String> {
    let access = access_token(provider, app_data_dir)?;
    let bytes = match provider {
        Provider::Google => download_google_fixed(&access, file_id)?,
        Provider::OneDrive => download_onedrive(&access, file_id)?,
    };
    let package = backup::package_from_bytes(&bytes)?;
    backup::restore_package(app_data_dir, &package)?;
    Ok(())
}
