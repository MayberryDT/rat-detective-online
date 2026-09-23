# Rat Detective highlights connector

This Manifest V3 extension is background plumbing for the Omarchy web app.
It does not add a toolbar button. Load the unpacked folder in Chromium
(`chrome://extensions`) after Highlights setup asks for it, then return to
the same Rat Detective app window.

- Production manifest matches `https://ratdetective.online/*` only.
- `manifest.dev.json` adds explicit loopback preview origins.
- Unpacked development ID is `lbhddkbbmnofokcjnlpfhffcplijjpnh`.
- The native host is `co.animasai.rat_detective_highlights`.
