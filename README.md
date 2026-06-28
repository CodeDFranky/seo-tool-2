# DFR Toolkit

A small desktop app for the parts of real-estate marketing that aren't building.

Two tools in one window:

- **SEO title generator** — generates listing-friendly title variants for an agent: name, city, state plus a few toggles (solo / team, abbreviations, character-count meter). Filter the list, click a title to copy.
- **Vlog library** — paste a YouTube or Vimeo URL (video, playlist, channel, or user). The app fetches the videos, shows metadata + thumbnails, lets you select and batch-download in a ZIP, or hit *Generate* on any card to download the video locally and capture a custom frame as a thumbnail. Drag any thumbnail straight out of the window onto your desktop or another app.

Runs locally on Windows. No accounts, no servers, no telemetry.

## Install

1. Download the latest installer from [Releases](https://github.com/CodeDFranky/seo-tool-2/releases/latest).
2. Double-click `DFR.Toolkit_*_x64-setup.exe`.
3. Windows SmartScreen will warn (the installer isn't code-signed by a paid CA). Click **More info** → **Run anyway**.
4. Launch from the Start menu.

Updates install themselves the next time you open the app.

## What's running under the hood

A Tauri desktop shell wraps a React UI and a small bundled Python service that calls yt-dlp for video work. Nothing leaves your machine except the API calls the underlying yt-dlp library makes to YouTube and Vimeo to fetch metadata and downloads.
