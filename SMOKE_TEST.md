# DFR Toolkit — smoke test

Runs end-to-end through every shipped feature in roughly 10–15 minutes. Walk it after every release before sharing the installer.

Pass criteria: every checkbox can be ticked without falling back to Task Manager or developer tools. If something's off, note the version + symptom and file before sharing.

---

## 1. Install + first launch

The most fragile path. If this is wrong, everything downstream is suspect.

- [ ] Uninstall previous version: **Settings → Apps → DFR Toolkit → Uninstall**
- [ ] Download the new installer from [Releases · latest](https://github.com/CodeDFranky/seo-tool-2/releases/latest)
- [ ] Confirm the installer file's icon in Explorer is the **dfr face**, not the rainbow NSIS disc
- [ ] Double-click → SmartScreen warns → **More info** → **Run anyway**
- [ ] Installer chrome's icon (top-right of the dialog) is also the dfr face
- [ ] Click through, launch from Start menu

**Watch for**: a small **frameless 440×220 splash window** appears centered, dfr logo + wordmark + a 1px gold bar at the bottom looping left-to-right. Should swap directly to the full main window in one motion — you should never see a chrome-only empty window first.

**Failure modes**: chrome-only empty window before splash (Rust window-swap broken); splash never closes (frontend_ready command broken); main window flashes briefly white (visible:false config regressed).

---

## 2. Top bar chrome

- [ ] Header shows: logo (clickable, returns to landing) · centered **SEO / Vlog** tabs · **gear icon** · version stamp (e.g. `v0.1.6`)
- [ ] Resize the window down to ~600px wide — wordmark hides, version stamp hides, gear stays visible
- [ ] Click the gear → Settings dialog opens
- [ ] Settings shows 4 sections: **Downloads**, **Privacy & Access**, **Engine**, **Notifications**

---

## 3. Vlog tab — happy path + per-channel cache

Use this URL (it has a premiere video that exercises the unavailable-card path):
`https://www.youtube.com/@twicejapan_official/videos`

- [ ] Paste URL → click **Fetch** → cards stream in
- [ ] **Video #2 (`M83nVWOlQ0k`)** specifically renders as a card with:
  - A real thumbnail (slightly grayscaled / dimmed)
  - Title: "Unavailable video"
  - A **gold "Premiere not yet aired" badge** in the thumbnail's bottom-right corner
  - The Generate button is replaced with a disabled "Can't capture" placeholder (hover the placeholder → tooltip shows the reason)
- [ ] Note roughly how long the full first batch took
- [ ] Click **Fetch** again on the same URL
- [ ] **Watch for**: a small "Loaded from cache (just now)" line under the URL, grid populates near-instantly
- [ ] A small **Refresh** icon button appears next to Fetch (only visible when grid is "done")
- [ ] Click Refresh → cache invalidates, grid re-fetches from network
- [ ] **Test cache survives app restart**: close + reopen the app, paste the same URL, hit Fetch → should still be a cache hit

**Failure modes**: skeleton cards stuck forever (means a metadata fetch threw uncaught); badge missing (frontend not reading `unavailable_reason`); cache miss after restart (localStorage not persisting).

---

## 4. Vlog tab — downloads (single + batch)

### Single thumbnail download

- [ ] Hover any card → small download icon top-right of the thumbnail
- [ ] Click it → native **Save-As dialog** opens (first time, no default folder set)
- [ ] Save somewhere obvious
- [ ] Toast appears with "Saved `<filename>`" + the full path + a **Reveal** button
- [ ] Click **Reveal** → File Explorer opens to the parent folder of the saved file

### Batch ZIP download

- [ ] Click the checkbox top-left of 3-5 cards
- [ ] **"Download N"** button appears top-right
- [ ] Click it → Save-As for the ZIP → save → same toast pattern with Reveal

### Download history panel

- [ ] Click the downloads icon in the Vlog header (next to the Captures icon) → slide-in drawer
- [ ] Files saved above appear grouped by **Today**, newest first
- [ ] Hover any row → **Reveal / Copy path / Remove** icons appear
- [ ] Click **Copy path** → toast confirms, paste somewhere to verify
- [ ] Click **Remove** → row disappears, history persists
- [ ] **Clear all** button in the panel header → confirms via toast

**Failure modes**: Save-As never appears (Tauri dialog plugin broken); ACL error `plugin:fs|write_file not allowed` (fs scope regressed); Reveal does nothing or errors `failed regex validation` (shell:allow-open scope regressed).

---

## 5. Settings — default download folder

- [ ] Settings → Downloads → **Browse…** → pick your `Downloads` folder
- [ ] Path shows in the field
- [ ] Close Settings; save another thumbnail
- [ ] **Watch for**: NO Save-As dialog this time, file writes directly, toast confirms with the path
- [ ] Settings → Downloads → **Clear** → save again → Save-As dialog returns

---

## 6. Vlog tab — capture flow (the original feature)

- [ ] Click **Generate** on a card with a real video (not the premiere)
- [ ] Button shows progress 0% → 100% (noticeably faster than v0.1.0; throttling was relaxed in v0.1.2)
- [ ] When done → modal auto-opens with the video player
- [ ] Drag the scrubber, click **Capture frame** → toast confirms, captured frame appears in the strip below the player
- [ ] **Drag the captured frame from the strip to your desktop** → JPEG lands on the desktop
- [ ] Click the download icon on a captured frame → goes to default folder OR Save-As

**Failure modes**: capture stalls (yt-dlp bundle broken or backend SSE issue); drag-out doesn't trigger anything (Tauri `dragDropEnabled: false` regressed); modal opens but video doesn't load (CORS / WebView2 video codec).

---

## 7. Settings — Engine (yt-dlp self-update)

- [ ] Settings → Engine section
- [ ] Field shows `v <version> · bundled` (matches the version inside the installer)
- [ ] Click **Check for update** → spinner → on success: toast "yt-dlp updated" with a **Restart now** action and the path it was saved to
- [ ] Click **Restart now** → app relaunches (splash again)
- [ ] Reopen Settings → Engine → field now shows `v <newer-version> · user copy`

**Failure modes**: command not found (Rust `update_ytdlp` command unregistered); download fails (reqwest TLS issue, network); the user-copy path isn't picked up by `_find_ytdlp` after restart.

---

## 8. Settings — Privacy & Access (cookies passthrough)

Hard to verify without an age-restricted video you're signed in for. Minimum check:

- [ ] Dropdown shows: None / Chrome / Edge / Firefox / Brave / Vivaldi / Opera
- [ ] Selection persists across app restart (set to Chrome → close → reopen → Settings → Privacy & Access still says Chrome)
- [ ] **Full end-to-end (optional)**: pick your browser, paste an age-restricted YouTube video you're signed in to in that browser → confirm the card loads normally instead of showing "Sign-in required"

---

## 9. Settings — Notifications

- [ ] Settings → Notifications → toggle **Capture is ready** ON, **Batch download finished** ON
- [ ] Trigger a capture (Generate on a card) → when it finishes, **Windows notification appears** (first time will request permission)
- [ ] Trigger a batch download (select cards + Download N) → notification appears when ZIP is saved

---

## 10. SEO tab — smoke

The SEO tab gets less love but it's still a real surface. Quick verify:

- [ ] Click **SEO** tab → form for Name / Location / State
- [ ] Fill all three → list of generated titles appears grouped by template
- [ ] Each title row has a green/yellow character-count chip
- [ ] Click a title → toast "Copied", paste to verify
- [ ] Toggle "Counter" → CharCounter expands → type in it → counter updates
- [ ] Switch back to Vlog tab → all your previously-loaded data is still there (tabs persist)

---

## 11. Auto-updater (the path your friends will use)

Can't fully test from the inside; this fires on the **next** install.

- [ ] **Sanity now**: launch any installed version, then publish a new release with a higher version number — relaunch the installed version → native "Update available" dialog appears
- [ ] Click Install → app downloads + installs + relaunches → version stamp shows the new number

---

## Quick triage table

| Symptom | Most likely cause |
|---|---|
| Chrome-only window flashes before splash | `visible:false` config or window-swap regressed |
| Save-As errors "not allowed by ACL" | `fs:scope` capability lost the `**` allow |
| Reveal errors "failed regex validation" | `shell:allow-open` regex regressed (must be `^.+$`) |
| Installer "Error opening file for writing" | NSIS pre-install hook missing or sidecar not being killed |
| Cards stay as skeletons forever | metadata fetch threw uncaught or transient network |
| Thumbnail shows broken-image icon | proxy URL not wrapped through `apiUrl()` for relative paths |
| Drag-out does nothing | `dragDropEnabled: false` lost from window config |
| Toast says "Saved" but no path | `saveBlob` return shape changed; downstream forgot to read `.path` |
