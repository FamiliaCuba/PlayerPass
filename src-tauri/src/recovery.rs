use chrono::{Duration, Utc};
use rand::{Rng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Serialize, Deserialize)]
struct Challenge {
    salt: String,
    code_hash: String,
    expires_at: String,
    failures: u32,
}

fn challenge_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("recovery_challenge.json")
}

/// Quita backticks/espacios/raros al pegar desde Discord.
pub fn normalize_code(code: &str) -> String {
    code.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect::<String>()
        .to_uppercase()
}

fn hash_code(salt: &[u8], code: &str) -> String {
    let normalized = normalize_code(code);
    let mut hasher = Sha256::new();
    hasher.update(salt);
    hasher.update(b"|");
    hasher.update(normalized.as_bytes());
    hex::encode(hasher.finalize())
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn generate_code() -> String {
    // ~40 bits de entropía.
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let mut part = |n: usize| -> String {
        (0..n)
            .map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char)
            .collect()
    };
    format!("PP-{}-{}-{}", part(4), part(4), part(4))
}

/// Crea un código de un solo uso (válido 30 min). Solo debe enviarse por Discord.
pub fn create_challenge(app_data_dir: &Path) -> Result<String, String> {
    fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let code = generate_code();
    let challenge = Challenge {
        salt: hex::encode(salt),
        code_hash: hash_code(&salt, &code),
        expires_at: (Utc::now() + Duration::minutes(30)).to_rfc3339(),
        failures: 0,
    };
    fs::write(
        challenge_path(app_data_dir),
        serde_json::to_string_pretty(&challenge).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(code)
}

pub fn clear_challenge(app_data_dir: &Path) {
    let _ = fs::remove_file(challenge_path(app_data_dir));
}

fn load_valid_challenge(app_data_dir: &Path) -> Result<(PathBuf, Challenge), String> {
    let path = challenge_path(app_data_dir);
    if !path.exists() {
        return Err(
            "No hay una solicitud de recuperación activa. Pulsa primero «Avisar al admin».".into(),
        );
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let challenge: Challenge = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let expires = chrono::DateTime::parse_from_rfc3339(&challenge.expires_at)
        .map_err(|_| "Challenge corrupto".to_string())?;
    if Utc::now() > expires {
        let _ = fs::remove_file(&path);
        return Err("El código expiró. Solicita uno nuevo.".into());
    }
    if challenge.failures >= 5 {
        let _ = fs::remove_file(&path);
        return Err("Demasiados intentos. Solicita un código nuevo.".into());
    }
    Ok((path, challenge))
}

/// Comprueba el OTP de Discord sin consumirlo (así un fallo posterior no lo quema).
pub fn verify_challenge(app_data_dir: &Path, code: &str) -> Result<(), String> {
    let (path, mut challenge) = load_valid_challenge(app_data_dir)?;
    let salt = hex::decode(&challenge.salt).map_err(|_| "Challenge corrupto".to_string())?;
    let expected = hash_code(&salt, code);
    if !constant_time_eq(&expected, &challenge.code_hash) {
        challenge.failures = challenge.failures.saturating_add(1);
        let _ = fs::write(
            &path,
            serde_json::to_string_pretty(&challenge).unwrap_or_default(),
        );
        return Err("Código incorrecto. Copia el de Discord tal cual (PP-XXXX-XXXX-XXXX).".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_discord_markdown() {
        assert_eq!(normalize_code(" `pp-a7k2-m9qx-2nph` "), "PP-A7K2-M9QX-2NPH");
    }

    #[test]
    fn challenge_roundtrip() {
        let dir = std::env::temp_dir().join(format!("pp-recovery-{}", UuidLike::new()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let code = create_challenge(&dir).unwrap();
        verify_challenge(&dir, &format!("`{code}`")).unwrap();
        clear_challenge(&dir);
        assert!(verify_challenge(&dir, &code).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    struct UuidLike;
    impl UuidLike {
        fn new() -> u64 {
            use std::time::{SystemTime, UNIX_EPOCH};
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos() as u64
        }
    }
}
