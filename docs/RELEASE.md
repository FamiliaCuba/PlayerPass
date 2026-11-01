# Publishing PlayerPass on GitHub (auto-update)

Copy-pasteable guide. Current aligned version: **0.1.0** (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`).

Remote: `https://github.com/FamiliaCuba/PlayerPass`.

---

## 0. Secrets checklist (before the first push)

**Never commit:**

| What | Where |
|------|--------|
| `src-tauri/secrets/local.rs` | already in `.gitignore` |
| Updater private key (`.key`) | outside the repo + GitHub Actions secret |
| Authenticode `.pfx` / `.pem` | outside the repo |
| `.env` | gitignored |
| Discord webhook / admin code | only in `local.rs` or CI secrets |

Check before `git add`:

```powershell
git status
git check-ignore -v src-tauri/secrets/local.rs
# Must report that the file is ignored.
```

---

## 1. Create the GitHub repo + first push (no secrets)

Create a public repo (recommended for the simple GitHub Releases updater) named e.g. `PlayerPass`.

```powershell
cd G:\GitHub\PlayerPass\PlayerPass

git remote add origin https://github.com/FamiliaCuba/PlayerPass.git

git add .
git status
# Confirm secrets/local.rs and *.key / *.pfx are NOT staged

git commit -m "chore: initial commit PlayerPass 0.1.0"
git branch -M main
git push -u origin main
```

### Updater endpoints

In `src-tauri/tauri.conf.json` → `plugins.updater.endpoints`:

```text
https://github.com/FamiliaCuba/PlayerPass/releases/latest/download/latest.json
```

---

## 2. Generate updater keys (Tauri signer)

```powershell
cd G:\GitHub\PlayerPass\PlayerPass
npm install
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\playerpass.key"
```

- **Public** (`playerpass.key.pub`): paste the **contents** into `tauri.conf.json` → `plugins.updater.pubkey`.
- **Private** (`playerpass.key`): **do not commit**. In GitHub → Settings → Secrets and variables → Actions:
  - `TAURI_SIGNING_PRIVATE_KEY` = full private key file contents
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = only if you generated the key with a password

Set the secret from a local key file (do not echo the contents):

```powershell
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo FamiliaCuba/PlayerPass < "$env:USERPROFILE\.tauri\playerpass.key"
# If the key has a password:
# gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo FamiliaCuba/PlayerPass --body "YOUR_PASSWORD"
```

Commit the pubkey in `tauri.conf.json` (it is meant to be public).

### `createUpdaterArtifacts`: local vs CI

| Context | Value | Why |
|---------|--------|-----|
| Local (`tauri.conf.json` in the repo) | `false` | `npm run tauri build` does not require a private key |
| CI (`.github/workflows/release.yml`) | flipped to `true` in the job | produces `.sig` + enables `latest.json` |

You do not need to edit the JSON by hand for each release if you use the workflow.

---

## 3. Optional app secrets in CI

The workflow builds `local.rs` as follows:

1. If secret `DISCORD_WEBHOOK_URL` exists → write `local.rs` from CI secrets.
2. Otherwise → copy `local.example.rs` (placeholders; recovery/OAuth stay stubbed).

Optional GitHub Actions secrets:

- `DISCORD_WEBHOOK_URL`
- `ADMIN_RECOVERY_CODE`
- `DISCORD_INVITE_URL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_ID`

---

## 4. CI workflow

File: `.github/workflows/release.yml`

- Trigger: push of tag `v*` (e.g. `v0.1.0`) or `workflow_dispatch`
- Runner: `windows-latest`
- Build: NSIS + updater (`updaterJsonPreferNsis: true`)
- Creates a GitHub Release with installer, signatures, and `latest.json`

Required secrets for a successful updater release:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (only if the key is password-protected)

---

## 5. How to publish an update (e.g. v0.1.0)

### 5.1 Align version (semver) in **3 places**

1. `package.json` → `"version": "0.1.0"`
2. `src-tauri/tauri.conf.json` → `"version": "0.1.0"`
3. `src-tauri/Cargo.toml` → `version = "0.1.0"`

The tag **must** match: `v0.1.0`.

### 5.2 Commit + tag + push

```powershell
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: release v0.1.0"
git push origin main

git tag v0.1.0
git push origin v0.1.0
```

### 5.3 Wait for the release

1. GitHub → Actions → **Release** workflow (must turn green).
2. GitHub → Releases → `PlayerPass v0.1.0` with:
   - `PlayerPass_0.1.0_x64-setup.exe`
   - `latest.json`
   - `.sig` files (optional for humans; the updater uses the signature embedded in `latest.json`)

### 5.4 Test the updater (end-to-end)

Pipeline green + `latest.json` proves **publish/signing**. An installed build only detects an update when a **newer** version is published.

1. Install `v0.1.0` from Releases.
2. Bump to `0.1.1` in the three version files, tag `v0.1.1`, push.
3. Open the installed app → startup check or **Settings → Check for updates**.

---

## 6. SmartScreen / Authenticode (optional)

Without a trusted code-signing certificate, Windows SmartScreen often shows “Windows protected your PC”. Expected.

Options:

1. **Thumbprint in** `tauri.conf.json` → `bundle.windows.certificateThumbprint` (cert in the machine/CI store).
2. **`signtool`** with a `.pfx` after the build (see README).
3. In CI: typical secrets `WINDOWS_CERTIFICATE` (base64 `.pfx`) + `WINDOWS_CERTIFICATE_PASSWORD` and a `signtool` step (not in the default workflow; add it when you have a cert).

Until then: document on the Releases page “More info → Run anyway”.

---

## 7. Per-release checklist

- [ ] Same version in all 3 files
- [ ] Tag `vX.Y.Z` matches that version
- [ ] Real `pubkey` in `tauri.conf.json` (not a placeholder)
- [ ] Endpoint points at `FamiliaCuba/PlayerPass`
- [ ] Secret `TAURI_SIGNING_PRIVATE_KEY` set in GitHub Actions
- [ ] `local.rs` is **not** in the commit
- [ ] No `.key` / `.pfx` / `.env` in the tree to push
- [ ] Actions green + Release with `setup.exe` + `latest.json`

---

## Quick commands — first publish v0.1.0

```powershell
# 1) Remote (once)
git remote add origin https://github.com/FamiliaCuba/PlayerPass.git

# 2) Updater keys (once)
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\playerpass.key"
# → paste .pub into tauri.conf.json
# → set private key as secret TAURI_SIGNING_PRIVATE_KEY

# 3) Real endpoint in tauri.conf.json (once)
# https://github.com/FamiliaCuba/PlayerPass/releases/latest/download/latest.json

# 4) First commit + push (if needed)
git add .
git status   # verify: no local.rs or keys
git commit -m "chore: initial commit PlayerPass 0.1.0"
git branch -M main
git push -u origin main

# 5) Release tag
git tag v0.1.0
git push origin v0.1.0
# → wait for Actions → Releases
```
