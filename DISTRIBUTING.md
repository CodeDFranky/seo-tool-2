# Distributing DFR Toolkit

> **TL;DR** — push the repo to GitHub, cut a release, attach the installer files. Your friends download one `.exe`, double-click, done. Future versions install themselves silently when they launch the app.

There are three viable paths. Pick by the audience and effort you want to spend.

## Option A — GitHub Releases (recommended)

This is the right answer for almost everyone. It's free, it powers the in-app auto-updater, and the download URL is permanent.

### One-time setup

1. **Push the repo to GitHub.** Public or private both work — releases are publicly downloadable on public repos, and on private repos you can mark individual releases public via "Set as the latest release" while the rest of the repo stays private. Easiest path: make the repo public.

2. **Confirm the updater endpoint matches your repo.** Open `frontend/src-tauri/tauri.conf.json` and verify the line:

   ```json
   "endpoints": [
     "https://github.com/CodeDFranky/seo-tool-2/releases/latest/download/latest.json"
   ]
   ```

   If your repo lives at a different slug, change it here, rebuild the installer, and *then* publish. Once your friends install version 0.1.0, the embedded URL is permanent for them — they'll keep checking the URL that was baked into the binary they originally installed.

### Cutting each release

```powershell
# 1. Bump version in three files (all three must match)
#    frontend/src-tauri/tauri.conf.json     -> "version": "0.2.0"
#    frontend/src-tauri/Cargo.toml          -> version = "0.2.0"
#    frontend/package.json                  -> "version": "0.2.0"

# 2. Build the installer (see README.md or RELEASING.md)
.\venv\Scripts\python.exe -m PyInstaller --noconfirm --clean backend\seo-backend.spec
Copy-Item .\dist\seo-backend.exe .\frontend\src-tauri\binaries\seo-backend-x86_64-pc-windows-msvc.exe -Force
cd frontend
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content ..\updater-keys\dfr-toolkit -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "dfr-toolkit-dev"
npx tauri build
cd ..

# 3. Tag and push
git tag v0.2.0
git push origin master --tags
```

### Publishing on GitHub

1. Go to `https://github.com/CodeDFranky/seo-tool-2/releases/new`
2. **Choose tag**: select `v0.2.0` (or whatever you just pushed)
3. **Release title**: `v0.2.0`
4. **Description**: 1–3 bullets of what changed
5. **Attach files** — drag in:
   - `frontend/src-tauri/target/release/bundle/nsis/DFR Toolkit_0.2.0_x64-setup.exe`
   - `frontend/src-tauri/target/release/bundle/nsis/DFR Toolkit_0.2.0_x64-setup.exe.sig`
   - A `latest.json` file you create (template below)
6. **Set as the latest release**: ✅ checked
7. **Publish**

### The `latest.json` manifest

This is what the in-app updater fetches to know whether a newer version exists. Create it once per release. Paste this template into a text editor:

```json
{
  "version": "0.2.0",
  "notes": "Short release notes that show up in the update dialog.",
  "pub_date": "2026-06-28T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "PASTE THE CONTENTS OF .sig FILE HERE",
      "url": "https://github.com/CodeDFranky/seo-tool-2/releases/download/v0.2.0/DFR.Toolkit_0.2.0_x64-setup.exe"
    }
  }
}
```

The `signature` field is the **literal contents** of `DFR Toolkit_0.2.0_x64-setup.exe.sig` — open that file in a text editor, copy everything, paste it in. JSON will preserve the line breaks via escaped `\n`.

The `url` is the public download URL of the installer (GitHub gives you this after you upload — right-click the attached file → "Copy link"). **Note the dots replace the space in the filename in the URL.**

### What your friends do

1. Go to `https://github.com/CodeDFranky/seo-tool-2/releases/latest`
2. Download `DFR Toolkit_0.1.0_x64-setup.exe`
3. Double-click. Windows SmartScreen will yell (see below) — click "More info" → "Run anyway"
4. Click through the installer
5. Launch DFR Toolkit from the Start Menu

**For all future updates:** they do nothing. When they next launch the app, it silently checks the GitHub manifest, downloads the new version, prompts them via a native dialog ("Update available: 0.2.0 — Install now?"), and relaunches.

## Option B — Quick & dirty (file host link)

Best for: showing one or two friends right now without any release infrastructure.

1. Take the file at `frontend/src-tauri/target/release/bundle/nsis/DFR Toolkit_0.1.0_x64-setup.exe`
2. Upload to Google Drive / Dropbox / WeTransfer / Discord attachment / etc.
3. Send them the link

Tradeoffs:
- ❌ **No auto-updates** — the app checks GitHub on launch; if you skip the release infra, every future version requires you to send your friends a new link.
- ❌ **No permanent URL** — file-host links rot.
- ✅ Zero setup.

You can use this once to validate the app works on a friend's machine, then move to Option A.

## Option C — Self-host

If you have your own domain / web server, you can host the `latest.json` and the installer files yourself. Change the `endpoints` in `tauri.conf.json` to point at your URL before building. Works identically to GitHub Releases, just on your own hardware.

---

## Windows SmartScreen warning (every option)

Because we're not paying for a code-signing certificate, Windows shows this on first run:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognized app from starting.

**This is expected and there is no bug to fix.** Your friends need to:

1. Click **"More info"**
2. Click **"Run anyway"**

Tell them this once. After they install, future launches and auto-updates don't trigger SmartScreen again.

### If you want to get rid of the warning entirely

Buy a code-signing certificate. Real options as of 2026:

| Provider | Type | Price/yr | Notes |
|---|---|---|---|
| Sectigo (via SSL.com, KSoftware) | OV | ~$150–250 | Cheapest "regular" cert. Still triggers SmartScreen until reputation builds (a few hundred installs). |
| DigiCert / GlobalSign | EV (Extended Validation) | ~$300–500 | Bypasses SmartScreen on day one. Requires a hardware USB token. |
| Azure Trusted Signing | Cloud-signed | ~$10/mo | Newest option, no hardware token. Good for solo devs. |

Once you have a cert, integrate it into the Tauri build via the [Windows signing docs](https://v2.tauri.app/distribute/sign/windows/). The bundle config gets a `windows.signCommand` entry. Past that, nothing changes for your friends — installs become silent.

For a friend-group personal app, the SmartScreen click-through is fine. Don't burn money on a cert unless you're distributing to dozens of users who'd flake at the warning.

---

## What lives where

| What | Where |
|---|---|
| The installer your friends download | `frontend/src-tauri/target/release/bundle/nsis/*.exe` |
| The signature file (companion to each installer) | `…/nsis/*.exe.sig` |
| The auto-update manifest you upload to GitHub | You write `latest.json` per release (template above) |
| The private signing key (NEVER commit) | `updater-keys/dfr-toolkit` (gitignored) |
| The embedded public key (already in the bundle) | `frontend/src-tauri/tauri.conf.json` → `plugins.updater.pubkey` |

The single hard rule: **don't lose `updater-keys/dfr-toolkit`**. If you do, you can never push another update — the embedded public key won't validate signatures made by a different private key, and your friends will be stuck on whatever version they last installed.
