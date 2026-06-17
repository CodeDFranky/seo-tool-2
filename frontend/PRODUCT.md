# DFR Toolkit

## What it is
A personal workbench for a real estate marketing operator: one window with two specialized tools.

## Surfaces
1. **Top bar** — pure-black strip with the DFR mark on the left, centered SEO / Vlog tool nav (gold underline on the active tab), version stamp on the right. Persistent across the app.
2. **SEO tab** — generates variant SEO titles for a real-estate listing from three inputs (agent name, city, state) plus a searchable state dropdown with an "Other" free-text branch. Toggles: solo/team, abbreviate state, abbreviate "Real Estate". Output is a filterable list of titles grouped by template, each with a 0–60 character count chip (good 45–60, warn outside). An inline character-counter / case-transform utility lives in the same controls panel.
3. **Vlog tab** — paste a YouTube video / playlist / channel URL. The app fetches video IDs, then loads metadata in batches of 12 with infinite scroll (IntersectionObserver sentinel near the bottom). Each card shows thumbnail / title / Generate / Copy Title / Copy Embed and is multi-selectable for a bulk thumbnail zip download. Thumbnails are draggable directly out of the page (HTML5 native drag-out with prefetched blobs + DownloadURL for desktop drops). The Generate button opens a yt-dlp-backed video player modal with frame-step controls; capturing the current frame produces a draggable JPEG.

## Who uses it
A single power user (the developer / agent). Runs locally as a Flask + React app. Used daily in short focused bursts.

## Register
**Product.** Design serves the workflow. Dense controls, fast feedback, no decorative friction.

## Visual direction
- **Strictly dark mode**, editorial. Near-black body (`hsl(0 0% 4%)`), charcoal panels (`hsl(0 0% 8%)`), inputs one step lifted (`hsl(0 0% 12%)`). Pure black top bar.
- **Gold accent** (`hsl(38 65% 58%)`), Zoom/LuxuryPresence-inspired. Used only for primary action buttons, the active tab underline, the section eyebrow ("TOOL 01 / TOOL 02"), good-state highlights, and the focus ring.
- **Zero rounded corners.** `--radius: 0` everywhere. Inputs, buttons, modals, cards, badges — all square.
- **No shadows.** Surface differentiation carried by hairline borders and slight lightness steps.
- Typography: Inter for body + headings, JetBrains Mono for numerals / kbd / codes. Uppercase tracked labels (`tracking-[0.10em–0.18em]`) for eyebrows, button text, badges, kbd hints. Title sizes ~26px semibold. Body 13px.
- Motion is fast and small: framer-motion crossfade between tabs (180ms), spring layoutId on the active-tab underline, micro hover/tap scales on action buttons, AnimatePresence for status strips.

## Non-goals
- Multi-user. No auth, no theming customization.
- A marketing site. No brand surface beyond the platform itself.
- A light mode toggle. Dark mode is the only shipped theme.
