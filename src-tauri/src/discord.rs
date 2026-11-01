use crate::secrets::DISCORD_WEBHOOK_URL;

fn sanitize_contact(contact: &str) -> String {
    contact
        .chars()
        .filter(|c| !matches!(c, '`' | '*' | '_' | '|' | '@' | '<' | '>' | '\n' | '\r'))
        .take(64)
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn notify_recovery_request(
    hostname: &str,
    contact: &str,
    recovery_code: &str,
) -> Result<(), String> {
    if DISCORD_WEBHOOK_URL.contains("REEMPLAZA") || DISCORD_WEBHOOK_URL.is_empty() {
        return Err("Webhook de Discord no configurado en este build".into());
    }

    let contact_line = {
        let cleaned = sanitize_contact(contact);
        if cleaned.is_empty() {
            "_sin contacto_".to_string()
        } else {
            cleaned
        }
    };

    let host = sanitize_contact(hostname);

    let content = format!(
        "**PlayerPass — solicitud de recuperación**\n\
Equipo: `{host}`\n\
Contacto: {contact_line}\n\
**Código para el cliente (entrégaselo):** `{recovery_code}`\n\
_Válido 30 minutos. Un solo uso._"
    );

    let body = serde_json::json!({
        "content": content,
        "username": "PlayerPass"
    });

    ureq::post(DISCORD_WEBHOOK_URL)
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("No se pudo avisar a Discord: {e}"))?;
    Ok(())
}

/// Sube un backup cifrado al webhook (archivo + nombre de usuario).
pub fn send_backup_file(
    hostname: &str,
    display_name: &str,
    filename: &str,
    bytes: &[u8],
) -> Result<(), String> {
    if DISCORD_WEBHOOK_URL.contains("REEMPLAZA") || DISCORD_WEBHOOK_URL.is_empty() {
        return Err("Webhook de Discord no configurado en este build".into());
    }
    if bytes.len() > 24 * 1024 * 1024 {
        return Err("El backup es demasiado grande para Discord (máx. ~25 MB)".into());
    }

    let user = {
        let cleaned = sanitize_contact(display_name);
        if cleaned.is_empty() {
            "sin_nombre".to_string()
        } else {
            cleaned
        }
    };
    let host = sanitize_contact(hostname);
    let safe_name = filename
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();

    let payload = serde_json::json!({
        "content": format!(
            "**PlayerPass — backup cifrado**\nUsuario: `{user}`\nEquipo: `{host}`\nArchivo: `{safe_name}`\n_El vault sigue cifrado; hace falta la contraseña maestra para abrirlo._"
        ),
        "username": "PlayerPass"
    });

    let boundary = "----PlayerPassBoundary7MA4YWxkTrZu0gW";
    let mut body: Vec<u8> = Vec::new();

    // payload_json
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        b"Content-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n",
    );
    body.extend_from_slice(payload.to_string().as_bytes());
    body.extend_from_slice(b"\r\n");

    // file
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"files[0]\"; filename=\"{safe_name}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(bytes);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());

    ureq::post(DISCORD_WEBHOOK_URL)
        .set(
            "Content-Type",
            &format!("multipart/form-data; boundary={boundary}"),
        )
        .send_bytes(&body)
        .map_err(|e| format!("No se pudo enviar el backup a Discord: {e}"))?;
    Ok(())
}

/// Solo notifica el evento — NUNCA la contraseña.
pub fn notify_password_reset(hostname: &str) -> Result<(), String> {
    if DISCORD_WEBHOOK_URL.contains("REEMPLAZA") || DISCORD_WEBHOOK_URL.is_empty() {
        return Err("Webhook de Discord no configurado en este build".into());
    }

    let host = sanitize_contact(hostname);
    let content = format!(
        "**PlayerPass — contraseña maestra restablecida**\nEquipo: `{host}`\n_(Sin detalles de la contraseña por seguridad.)_"
    );

    let body = serde_json::json!({
        "content": content,
        "username": "PlayerPass"
    });

    ureq::post(DISCORD_WEBHOOK_URL)
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("No se pudo enviar a Discord: {e}"))?;
    Ok(())
}
