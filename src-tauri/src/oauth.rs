use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::mpsc,
    thread,
    time::Duration,
};

pub const OAUTH_REDIRECT: &str = "http://127.0.0.1:17855/oauth/callback";
const OAUTH_PORT: u16 = 17855;

pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
    pub state: String,
}

pub fn generate_pkce() -> Pkce {
    let mut verifier_bytes = [0u8; 32];
    let mut state_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut verifier_bytes);
    rand::thread_rng().fill_bytes(&mut state_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = URL_SAFE_NO_PAD.encode(state_bytes);
    Pkce {
        verifier,
        challenge,
        state,
    }
}

/// Abre el navegador y espera el `code` en el redirect local.
pub fn wait_for_auth_code(expected_state: &str) -> Result<String, String> {
    let listener = TcpListener::bind(("127.0.0.1", OAUTH_PORT)).map_err(|e| {
        format!(
            "No se pudo abrir el puerto {OAUTH_PORT} para OAuth (¿otra instancia abierta?): {e}"
        )
    })?;
    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;

    let (tx, rx) = mpsc::channel::<Result<(String, String), String>>();
    thread::spawn(move || {
        let result = (|| {
            let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
            let req = String::from_utf8_lossy(&buf[..n]);
            let first_line = req.lines().next().unwrap_or("");
            // GET /oauth/callback?code=...&state=... HTTP/1.1
            let path = first_line.split_whitespace().nth(1).unwrap_or("");
            let query = path.split('?').nth(1).unwrap_or("");
            let mut code = None;
            let mut state = None;
            for pair in query.split('&') {
                let mut it = pair.splitn(2, '=');
                let k = it.next().unwrap_or("");
                let v = it.next().unwrap_or("");
                match k {
                    "code" => code = Some(urlencoding::decode(v).unwrap_or_default().to_string()),
                    "state" => state = Some(urlencoding::decode(v).unwrap_or_default().to_string()),
                    "error" => {
                        return Err(format!(
                            "OAuth cancelado o rechazado: {}",
                            urlencoding::decode(v).unwrap_or_default()
                        ));
                    }
                    _ => {}
                }
            }
            let body = "<!doctype html><html><body style='font-family:sans-serif;background:#111;color:#eee;display:grid;place-items:center;height:100vh'><div><h2>PlayerPass</h2><p>Login correcto. Ya puedes volver a la app.</p></div></body></html>";
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(resp.as_bytes());
            Ok((
                code.ok_or_else(|| "OAuth sin código".to_string())?,
                state.unwrap_or_default(),
            ))
        })();
        let _ = tx.send(result);
    });

    let (code, state) = rx
        .recv_timeout(Duration::from_secs(180))
        .map_err(|_| "Tiempo de espera de login agotado (3 min)".to_string())?
        .map_err(|e| e)?;

    if state != expected_state {
        return Err("Estado OAuth inválido (posible CSRF)".into());
    }
    Ok(code)
}

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    #[allow(dead_code)]
    pub expires_in: Option<u64>,
    #[allow(dead_code)]
    pub token_type: Option<String>,
}

pub fn post_form(url: &str, form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let body = form
        .iter()
        .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    let resp = ureq::post(url)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send_string(&body)
        .map_err(|e| format!("Token OAuth: {e}"))?;

    resp.into_json::<TokenResponse>()
        .map_err(|e| format!("Respuesta OAuth inválida: {e}"))
}
