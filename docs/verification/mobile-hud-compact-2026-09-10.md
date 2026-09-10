# Compact mobile HUD — September 10, 2026

Tyler confirmed the phone build works well after the firing fix, then requested smaller translucent mobile cards, the missing incident time bar and a Closing Time card that stays visible during roulette.

## Changes

All application changes are scoped to `.touch-mode` in `src/ui/touchControls.css`:

- Assignment/top-five cards, the incident card, roulette and assignment reveal render at 70% of their preceding width and height, anchored to their existing corners or top-center. The incident card also gains its timer bar, so its total height includes that restored content.
- Dark paper surfaces use approximately 64–66% opacity. Inner strips/tabs are translucent; lettering retains full opacity. Desktop cards, full SCORES table and touch targets retain their previous sizing.
- The existing incident progress bar is visible on mobile and continues using the authoritative timer fraction. It had been hidden by responsive CSS.
- Assignment cards stay visible while incident roulette rolls, reveals and leaves on mobile. New-assignment briefing behavior is retained. The previous blanket roulette rule had hidden Closing Time even while its shared timer continued.

No changes to scoring, timers, audio, input, camera, graphics, physics or server behavior. The only other code change adds four explicit static incident states to the actual-camera fixture.

## Validation

Seven static actual-camera views were captured before and after: Excessive Force, Chain, Closing Time rolling/reveal/ending, narrow 667×375 Chain and a 1280×720 desktop reference. Other mobile captures use 844×390. These contain no gameplay inputs or networking.

Measured assignment and roulette widths are exactly 0.7× their preceding widths. Closing remains visible in rolling/reveal states. Mobile incident bars are displayed, with correct 0.8 and 0.2 fractions at 20 and 5 seconds remaining. FIRE/JUMP dimensions are unchanged. Desktop measured card sizing, background and visibility match the preceding version. Screenshots were visually reviewed for reticle clearance and overlap. No new human phone playtest, GPU measurement or multi-human test was performed.

Full suites pass: **719 tests** (107 Worker, 588 client, 24 script), client concurrency limited to four. Typecheck and both builds pass. Existing chunk-size warning remains. No implementation-mirroring CSS unit tests were added; real browser layout checks cover the presentation changes.

## Private preview

Client `index-CWpLt-II.js` / `index-O_ejemV-.css`, frozen under `output/mobile-hud-compact-2026-09-10/client`. Source hashes, before/after PNGs, layout measurements and build/protocol receipts are retained in that output directory. All three existing relays serve the new client; the private Worker remains `1c91db50-d6d7-44aa-856a-364beca8aa6c`, protocol 5, expiring **September 10 at 12:25 PM Pacific**. No Worker/production deployment or push.

Served HTML/JS/CSS and all 13 WAVs match the frozen client on each route. Separate six-second passive sessions each received eight rats with protocol 5 and zero invalid packets: desktop 156 snapshots, Tailscale 168, Wi-Fi 159. These establish asset/protocol readiness, not human multiplayer validation.

[Tailscale preview](http://100.79.24.11:5192/?room=graybox-benchmark-match-mobile-v18&lighting=pools&revision=mobile-hud-v20). Refresh the phone page to load the new immutable assets.
