# Publicar PlayerPass en GitHub (auto-update)

Guía copy-pasteable. Versión actual alineada: **0.1.0** (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`).

No había `git remote` / `origin` al preparar esto → usa `OWNER/REPO` hasta que tengas el repo real.

---

## 0. Checklist de secretos (antes del primer push)

**Nunca subas:**

| Qué | Dónde |
|-----|--------|
| `src-tauri/secrets/local.rs` | ya está en `.gitignore` |
| Privkey del updater (`.key`) | fuera del repo + secreto GitHub |
| `.pfx` / `.pem` Authenticode | fuera del repo |
| `.env` | gitignored |
| Webhook Discord / código admin | solo en `local.rs` o secretos CI |

Comprueba antes de `git add`:

```powershell
git status
git check-ignore -v src-tauri/secrets/local.rs
# Debe decir que está ignorado.
```

---

## 1. Crear repo en GitHub + primer push (sin secrets)

En [github.com/new](https://github.com/new): nombre p. ej. `PlayerPass`, público o privado (el updater de GitHub Releases necesita que los assets del release sean descargables por la app; con repo privado hace falta token y configuración extra — **recomendado: repo público** para el updater simple).

En PowerShell, desde la raíz del proyecto:

```powershell
cd G:\GitHub\PlayerPass\PlayerPass

# Sustituye OWNER y el nombre del repo
git remote add origin https://github.com/OWNER/REPO.git

git add .
git status
# Revisa que NO aparezca secrets/local.rs ni *.key / *.pfx

git commit -m "chore: initial commit PlayerPass 0.1.0"
git branch -M main
git push -u origin main
```

### Actualizar endpoints del updater

En `src-tauri/tauri.conf.json` → `plugins.updater.endpoints`:

```text
https://github.com/OWNER/REPO/releases/latest/download/latest.json
```

Sustituye `OWNER/REPO` por tu remoto real (ej. `fmcuba/PlayerPass`) y haz commit de ese cambio.

---

## 2. Generar claves del updater (Tauri signer)

```powershell
cd G:\GitHub\PlayerPass\PlayerPass
npm install
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\playerpass.key"
```

- **Pública** (`playerpass.key.pub`): pega el **contenido** en `tauri.conf.json` → `plugins.updater.pubkey` (reemplaza `REPLACE_WITH_TAURI_SIGNER_PUBLIC_KEY`).
- **Privada** (`playerpass.key`): **no** la subas. En GitHub → Settings → Secrets and variables → Actions:
  - `TAURI_SIGNING_PRIVATE_KEY` = contenido completo del archivo privado
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = solo si la generaste con contraseña

Commit de la pubkey en `tauri.conf.json` (es pública a propósito).

### `createUpdaterArtifacts`: local vs CI

| Contexto | Valor | Motivo |
|----------|--------|--------|
| Local (`tauri.conf.json` en el repo) | `false` | `npm run tauri build` no exige privkey |
| CI (`.github/workflows/release.yml`) | se pone a `true` en el job | genera `.sig` + permite `latest.json` |

No hace falta cambiar el JSON a mano para cada release si usas el workflow.

---

## 3. Secretos opcionales de la app en CI

El workflow crea `local.rs` así:

1. Si existe el secreto `DISCORD_WEBHOOK_URL` → escribe `local.rs` con los secretos CI.
2. Si no → copia `local.example.rs` (placeholders; recovery/OAuth quedan desactivados o stub).

Secretos opcionales en GitHub Actions:

- `DISCORD_WEBHOOK_URL`
- `ADMIN_RECOVERY_CODE`
- `DISCORD_INVITE_URL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_ID`

---

## 4. Workflow CI

Archivo: `.github/workflows/release.yml`

- Trigger: push de tag `v*` (ej. `v0.1.0`) o `workflow_dispatch`
- Runner: `windows-latest`
- Build: NSIS + updater (`updaterJsonPreferNsis: true`)
- Crea GitHub Release con instalador, firmas y `latest.json`

---

## 5. Cómo publicar un update (ej. v0.1.0)

### 5.1 Alinear versión (semver) en **3 sitios**

1. `package.json` → `"version": "0.1.0"`
2. `src-tauri/tauri.conf.json` → `"version": "0.1.0"`
3. `src-tauri/Cargo.toml` → `version = "0.1.0"`

El tag **debe** coincidir: `v0.1.0`.

### 5.2 Commit + tag + push

```powershell
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: release v0.1.0"
git push origin main

git tag v0.1.0
git push origin v0.1.0
```

### 5.3 Esperar el release

1. GitHub → Actions → workflow **Release** (debe ponerse verde).
2. GitHub → Releases → aparece `PlayerPass v0.1.0` con:
   - `PlayerPass_0.1.0_x64-setup.exe`
   - `latest.json`
   - archivos `.sig` (opcionales para humanos; el updater usa la firma embebida en `latest.json`)

### 5.4 Probar el updater

1. Instala una build anterior (o la misma y luego publica `v0.1.1`).
2. Abre la app → comprueba al arranque o **Ajustes → Comprobar actualizaciones**.

---

## 6. SmartScreen / firma Authenticode (opcional)

Sin certificado de código de confianza, Windows SmartScreen suele mostrar “Windows protegió tu PC”. Es esperado.

Opciones:

1. **Thumbprint en** `tauri.conf.json` → `bundle.windows.certificateThumbprint` (cert en el almacén de la máquina/CI).
2. **`signtool`** con `.pfx` tras el build (ver README).
3. En CI: secretos típicos `WINDOWS_CERTIFICATE` (base64 del `.pfx`) + `WINDOWS_CERTIFICATE_PASSWORD` y un paso `signtool` (no incluido por defecto en el workflow; añádelo cuando tengas el cert).

Hasta entonces: documenta en la página de Releases “Más información → Ejecutar de todas formas”.

---

## 7. Checklist final por release

- [ ] Versión igual en los 3 archivos
- [ ] Tag `vX.Y.Z` = esa versión
- [ ] `pubkey` real en `tauri.conf.json` (no el placeholder)
- [ ] Endpoint `OWNER/REPO` sustituido por el repo real
- [ ] Secreto `TAURI_SIGNING_PRIVATE_KEY` en GitHub Actions
- [ ] `local.rs` **no** está en el commit (`git status` limpio de secrets)
- [ ] No hay `.key` / `.pfx` / `.env` en el árbol a subir
- [ ] Actions verde + Release con `setup.exe` + `latest.json`

---

## Comandos rápidos — primera publicación v0.1.0

```powershell
# 1) Remote (una vez)
git remote add origin https://github.com/OWNER/REPO.git

# 2) Claves updater (una vez)
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\playerpass.key"
# → pega .pub en tauri.conf.json
# → mete la privkey en secret TAURI_SIGNING_PRIVATE_KEY

# 3) Endpoint real en tauri.conf.json (una vez)
# https://github.com/OWNER/REPO/releases/latest/download/latest.json

# 4) Primer commit + push (si aún no hay commits)
git add .
git status   # verificar: sin local.rs ni claves
git commit -m "chore: initial commit PlayerPass 0.1.0"
git branch -M main
git push -u origin main

# 5) Tag de release
git tag v0.1.0
git push origin v0.1.0
# → esperar Actions → Releases
```
