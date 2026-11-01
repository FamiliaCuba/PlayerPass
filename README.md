# PlayerPass

Gestor local de cuentas de juegos: un solo sitio para guardarlas cifradas y copiar usuario/contraseña con un clic.

## Características

- Vault cifrado en disco (Argon2id + AES-256-GCM)
- Contraseña maestra al abrir la app
- Autobloqueo por inactividad (configurable)
- Limpieza automática del portapapeles (configurable; solo si el contenido sigue siendo el de PlayerPass)
- Favoritas, papelera con vaciado total, tema claro/oscuro
- Plataformas con icono (Steam, Xbox, Battle.net, EA, Epic, etc.)
- Catálogo de juegos populares (CoD, Warzone, Battlefield, etc.)
- Copiar usuario, contraseña o `usuario:contraseña`
- Backup local / Drive / OneDrive (OAuth opcional)
- Recuperación asistida por admin (código + aviso Discord en builds privados)
- Auto-update desde GitHub Releases (requiere claves updater + repo público)
- UI estilo escritorio moderno

## Requisitos

- Node.js 20+
- Rust (stable)
- En Windows: Visual Studio Build Tools (C++) / Desktop development with C++
- WebView2 (viene con Windows 10/11 recientes)

## Instalación (Windows) — aviso SmartScreen

1. Descarga el instalador NSIS desde Releases: `PlayerPass_x.y.z_x64-setup.exe`.
2. Al abrirlo, **Windows SmartScreen** puede decir que “Windows protegió tu PC”.
3. Pulsa **Más información** → **Ejecutar de todas formas**.
4. Completa el instalador (modo usuario actual).

**Por qué aparece SmartScreen:** sin un certificado de firma de código de confianza (Authenticode), Windows marca el `.exe` como desconocido. Es normal en software indie / open source sin certificado de pago.

**Recomendación:** firma el instalador con un certificado Authenticode (ver sección [Firma de código](#firma-de-código-windows)). Hasta entonces el aviso seguirá saliendo.

Si hay Discord de soporte/comunidad, el enlace se configura en `src-tauri/secrets/local.rs` (`DISCORD_INVITE_URL`) y aparece en la app.

## Desarrollo

```bash
# Secretos locales (obligatorio para recovery/Discord en release)
cp src-tauri/secrets/local.example.rs src-tauri/secrets/local.rs
# Edita local.rs con tu webhook y código admin (nunca lo subas a git)

npm install
npm run tauri dev
```

## Build (Windows)

```bash
npm install
# En PowerShell con entorno MSVC (vcvars64) si hace falta:
npm run tauri build
```

Salidas típicas:

- `src-tauri/target/release/bundle/nsis/PlayerPass_0.1.0_x64-setup.exe` ← **usa este instalador**
- `src-tauri/target/release/playerpass.exe`

## Firma de código (Windows)

Sin certificado, SmartScreen seguirá avisando. Cuando tengas un `.pfx` o un certificado en el almacén de Windows:

### Opción A — thumbprint en Tauri

En `src-tauri/tauri.conf.json` → `bundle.windows`:

- `certificateThumbprint`: thumbprint SHA1 del certificado (cadena sin espacios)
- `digestAlgorithm`: `"sha256"`
- `timestampUrl`: p. ej. `"http://timestamp.digicert.com"`

Luego `npm run tauri build` firmará el bundle NSIS.

### Opción B — signtool + archivo .pfx

```powershell
# Ejemplo (ajusta rutas y password)
signtool sign /f "C:\certs\playerpass.pfx" /p "%CERT_PASSWORD%" /fd sha256 /tr http://timestamp.digicert.com /td sha256 `
  "src-tauri\target\release\bundle\nsis\PlayerPass_0.1.0_x64-setup.exe"
```

Variables de entorno habituales en CI: `WINDOWS_CERTIFICATE` (base64 del `.pfx`), `WINDOWS_CERTIFICATE_PASSWORD`.

**Sin certificado del usuario no se puede firmar de verdad** — la config ya está preparada; solo falta el cert.

## Auto-update (GitHub Releases)

PlayerPass usa `tauri-plugin-updater` + `tauri-plugin-process` (relanzar).

**Guía completa (crear repo, claves, CI, tag `v0.1.0`, checklist):** [docs/RELEASE.md](docs/RELEASE.md).

Resumen:

1. Generar claves: `npm run tauri signer generate -- -w ~/.tauri/playerpass.key` → pubkey en `tauri.conf.json`, privkey en secreto GitHub `TAURI_SIGNING_PRIVATE_KEY`.
2. Endpoint: `https://github.com/OWNER/REPO/releases/latest/download/latest.json` (sustituye `OWNER/REPO`; no había `origin` al preparar esto).
3. `bundle.createUpdaterArtifacts`: `false` en el repo (build local sin privkey); el workflow CI lo activa solo en el job de release.
4. Publicar: bump versión en 3 sitios → tag `vX.Y.Z` → push del tag → Actions + GitHub Release (`setup.exe` + `latest.json`).
5. La app comprueba updates al arrancar y desde **Ajustes → Comprobar actualizaciones**.

Sin privkey / pubkey / release público, la comprobación fallará de forma segura (no rompe el vault).

## Secretos (no van a GitHub)

`src-tauri/secrets/local.rs` está en `.gitignore`. Ahí viven:

- `DISCORD_WEBHOOK_URL` — se embebe en el `.exe` al compilar
- `ADMIN_RECOVERY_CODE` — secreto interno de recuperación de build
- `DISCORD_INVITE_URL`
- `GOOGLE_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_ID` — backups en Drive/OneDrive

### OAuth (Google Drive + OneDrive)

Redirect URI idéntica en ambas consolas:

`http://127.0.0.1:17855/oauth/callback`

1. **Google:** Google Cloud Console → APIs → habilita Google Drive API → Credenciales → ID de cliente OAuth **Aplicación de escritorio** → pega el Client ID en `local.rs`.
2. **Microsoft:** Azure Portal → App registrations → New → Accounts in any org + personal → Authentication → Mobile and desktop → agrega el redirect → Application (client) ID en `local.rs`. Plataforma pública (sin secret). Permiso Graph: `Files.ReadWrite.AppFolder` + `offline_access`.

En la app: **Backup** (vault abierto) o **Restaurar backup** (login). El archivo `.playerpass` sigue cifrado con la maestra.

## Seguridad

- Vault: Argon2id + AES-256-GCM (datos locales).
- Autobloqueo tras N minutos de inactividad (default 10; ajustable en Ajustes).
- Portapapeles: se limpia a los N segundos (default 25) solo si el texto sigue siendo el copiado.
- Recuperación: OTP de un solo uso solo por Discord (no vuelve al frontend); rate limiting en unlock/recovery.
- La nueva contraseña maestra **no** se envía a Discord (solo aviso de evento).
- `secrets/local.rs` (webhook / código admin) se embebe en el `.exe`: **no lo subas a GitHub** y rótalo si el binario se filtra.
- Limitación conocida: un atacante con el `.exe` y el archivo `vault.enc` puede intentar abusar del secreto de recuperación embebido (riesgo inherente a recovery admin en cliente).

## Licencia

MIT — ver [LICENSE](LICENSE).
