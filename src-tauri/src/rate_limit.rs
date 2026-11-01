use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Serialize, Deserialize, Default)]
struct Bucket {
    failures: u32,
    locked_until: Option<String>,
}

fn path_for(app_data_dir: &Path, name: &str) -> PathBuf {
    app_data_dir.join(format!("rate_{name}.json"))
}

fn load(app_data_dir: &Path, name: &str) -> Bucket {
    let path = path_for(app_data_dir, name);
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save(app_data_dir: &Path, name: &str, bucket: &Bucket) -> Result<(), String> {
    fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(bucket).map_err(|e| e.to_string())?;
    fs::write(path_for(app_data_dir, name), json).map_err(|e| e.to_string())
}

fn locked_message(locked_until: &str) -> String {
    if let Ok(until) = chrono::DateTime::parse_from_rfc3339(locked_until) {
        let secs = (until.with_timezone(&Utc) - Utc::now()).num_seconds().max(1);
        return format!("Demasiados intentos. Espera {secs}s.");
    }
    "Demasiados intentos. Espera un momento.".into()
}

pub fn check(app_data_dir: &Path, name: &str) -> Result<(), String> {
    let bucket = load(app_data_dir, name);
    if let Some(until) = &bucket.locked_until {
        if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(until) {
            if Utc::now() < ts {
                return Err(locked_message(until));
            }
        }
    }
    Ok(())
}

pub fn register_failure(app_data_dir: &Path, name: &str, max_failures: u32) -> Result<(), String> {
    let mut bucket = load(app_data_dir, name);
    // Limpia candado viejo.
    if let Some(until) = &bucket.locked_until {
        if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(until) {
            if Utc::now() >= ts {
                bucket.failures = 0;
                bucket.locked_until = None;
            }
        }
    }
    bucket.failures = bucket.failures.saturating_add(1);
    if bucket.failures >= max_failures {
        let lock_secs = 30u32 * (1u32 << (bucket.failures.saturating_sub(max_failures).min(4)));
        bucket.locked_until = Some((Utc::now() + Duration::seconds(lock_secs as i64)).to_rfc3339());
    }
    save(app_data_dir, name, &bucket)
}

pub fn register_success(app_data_dir: &Path, name: &str) -> Result<(), String> {
    save(app_data_dir, name, &Bucket::default())
}
