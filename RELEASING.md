# Releasing a new version

The Tauri app checks for updates on every launch. New releases are pulled from
GitHub Releases and verified against the embedded public key.

## One-time setup

1. **Save the private key** (`updater-keys/dfr-toolkit`) somewhere safe and
   offline. Without it, no future update will install (the embedded public
   key won't validate anything else).
2. **The public key** is already baked into `frontend/src-tauri/tauri.conf.json`
   under `plugins.updater.pubkey`. Don't change it after users have installed
   the app — they'll stop receiving updates.
3. The current update endpoint is
   `https://github.com/CodeDFranky/seo-tool-2/releases/latest/download/latest.json`.
   Change `endpoints` in `tauri.conf.json` if the repo or hosting moves.

## Cutting a release

From the repo root:

```powershell
# 1. Bump the version everywhere it's tracked
#    - frontend/src-tauri/tauri.conf.json   (version)
#    - frontend/src-tauri/Cargo.toml        (version)
#    - frontend/package.json                (version, optional)

# 2. Rebuild the Python sidecar
.\venv\Scripts\python.exe -m PyInstaller --noconfirm --clean backend\seo-backend.spec
Copy-Item .\dist\seo-backend.exe `
  .\frontend\src-tauri\binaries\seo-backend-x86_64-pc-windows-msvc.exe -Force

# 3. Sign + build the desktop bundle. The env vars tell Tauri where to find
#    the private key. The placeholder password 'dfr-toolkit-dev' was used
#    when the dev keypair was generated; rotate both the key and password
#    before public release.
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content `
  C:\Users\dfranky\Desktop\DEV\seo-tool-2\updater-keys\dfr-toolkit -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "dfr-toolkit-dev"

cd frontend
npx tauri build
```

`tauri build` produces, under `frontend/src-tauri/target/release/bundle/`:

- `nsis/DFR Toolkit_<version>_x64-setup.exe`  — the installer your users run
- `nsis/DFR Toolkit_<version>_x64-setup.exe.sig`  — minisign signature
- `msi/DFR Toolkit_<version>_x64_en-US.msi`  — alternate installer
- `msi/DFR Toolkit_<version>_x64_en-US.msi.sig`

## Publishing the update

1. Tag the commit (e.g. `git tag v0.2.0 && git push --tags`).
2. Create a GitHub Release attached to that tag.
3. Upload **both** the installer (`.exe` or `.msi`) and its `.sig` file.
4. Add a `latest.json` file as a release asset with this shape:

   ```json
   {
     "version": "0.2.0",
     "notes": "What changed in this release",
     "pub_date": "2026-06-28T12:00:00Z",
     "platforms": {
       "windows-x86_64": {
         "signature": "<contents of the .sig file as a single line>",
         "url": "https://github.com/CodeDFranky/seo-tool-2/releases/download/v0.2.0/DFR.Toolkit_0.2.0_x64-setup.exe"
       }
     }
   }
   ```

   The `signature` field is the literal contents of `<installer>.sig` (the
   base64 string starting with `untrusted comment:`). Paste it as a single
   line — JSON will preserve the newlines via the `\n` it auto-escapes.

5. Once the release is marked "latest" on GitHub, the next time any user
   launches the app it will detect the new version, download the installer,
   verify the signature, install, and relaunch — no action required from them.

## Rolling back

A bad release can't be silently fixed once shipped — clients have already
checked the signature against the embedded public key. To recover:

1. Edit the GitHub Release's `latest.json` to point back at the previous
   installer and signature.
2. Bump the version inside the manifest to be **higher** than the bad release
   (e.g. `0.2.0 → 0.2.1` even though the binary is from 0.1.9). Clients
   only update forward.
