# Omarchy Dispatch desk — September 14, 2026

The matching game update is deployed, the Dispatch companion is installed locally,
and plugin version 1.0.0 is published. The
[marketplace submission](https://github.com/omacom/omarchy-plugin-marketplace/issues/6926)
is awaiting maintainer review.

Tyler requested all features in the [Dispatch plan](../omarchy-dispatch-plan.md),
using parallel Sol agents at medium reasoning. Four workers implemented the
server feed/directory, shell UI/service, desktop adapter and invitation routing.
The parent integrated and reviewed the changes, packaged the release, checked the
live desktop and hosted backend, and published it. The existing dirty game
checkout and previous gameplay changes were preserved; no game-repository commit
was created.

## Released behavior

- Additive `GET /api/companion/v1/status`, schema version 1. Active GameRooms publish
  bounded public summaries to the existing Matchmaker directory. Reads use bounded
  pagination without calling or waking GameRooms. Generation/revision checks,
  freshness and retirement tombstones prevent stale publications from reviving rooms.
- All four assignments expose authoritative objectives, public holder/results,
  attached-human activity and score rows. Reconnect-reserved rats remain physically
  present in player counts; attached-human counts update on departure. Private
  rooms, positions, reconnect credentials and unrevealed next zones are excluded.
- Closing Time advances its companion clock only for a living holder. Jurisdiction
  retains fractional public progress while publication signatures use whole-second
  progress; an actual GameRoom test bounds publications during continuous scoring.
- Public invitations respect normal admission/capacity. Title preparation honors
  preferred overflow rooms. Successful entry consumes the invitation parameter so
  ordinary same-tab reloads can resume through private tab-local credentials.
- Shared shell polling, bounded pagination, retry backoff, honest connectivity
  states, room selection, assignment progress, top-three objective leaders and
  collapsible combat totals. Clocks stop when reports are stale.
- Exact-window Return, explicit separate Join, canonical invitation copying,
  optional recording/captures, workspace/fullscreen preferences and shortcuts.
  Shortcut installation checks both local Lua and active compositor bindings,
  backs up changes and rolls back rejected configuration.
- Alerts start disabled, use fresh transitions and persistent deduplication,
  respect quiet hours/DND and suppress notices during focused play. Desktop audio
  also starts disabled; the adapter does not enable microphone capture.
- Durable launcher/helper/icon survive plugin removal. Fresh installs and upgrades
  work from the panel. Reproducible exports include hashes/modes; staged local
  installation preserves unrelated files and provides backups/rollback.

## Deployment and publication

| Item | Verified value |
| --- | --- |
| Production | `https://ratdetective.online/`, Worker `rat-detective-preview`, environment `production` |
| Production version | `55a9e2fe-e219-451d-aa55-de48ba72928e` |
| Previous production | `b0518f94-4dc1-433f-af5f-7141a70d2d4b` |
| Gameplay protocol | 18, unchanged |
| Staging version | `6ea90f7f-61fa-471d-b3ba-20e308208ebd` |
| Plugin repository | [MayberryDT/rat-detective-omarchy](https://github.com/MayberryDT/rat-detective-omarchy) |
| Plugin release | [v1.0.0](https://github.com/MayberryDT/rat-detective-omarchy/releases/tag/v1.0.0) |
| Plugin commit | `130e2d59b305e045a8348e69f6c5f91c9f520238` |
| Package content hash | `fb35be376d6c82e3cd594914b473815eec5175159bd7ee7ede1b2f5428374b13` |
| Release archive SHA-256 | `dd0bcef3e589cd0118c1851f669448d3ecbe6afaf7bb22fe7ce80e373966365b` |
| Package CI | [Passing release validation](https://github.com/MayberryDT/rat-detective-omarchy/actions/runs/34877468791) |

The installed plugin at `~/.config/omarchy/plugins/co.animasai.rat-detective` matches
the published release. A fresh public clone was checked against every receipt
hash and executable mode, and its matching Git metadata was attached to the
previous manual installation. Normal `omarchy plugin update` reports up to date.
The separate desktop entry reports installed, canonical and durable. Prior manual
plugin copies remain under `~/.local/state/rat-detective/plugin-backups/`; the
legacy launcher was backed up before replacement.

## Checks performed

- Full game suite: **1,180 passed** (158 Worker, 963 client, 59 Node script tests).
  Typecheck and production build passed. The existing large-chunk build warning
  remains; no unrelated game tuning was performed.
- Subsequent desktop refinements: **31 focused plugin tests passed** (15 desktop
  adapter, 9 model, 7 packaging). Coverage includes fresh direct launcher installs,
  idempotency, upgrade backups, exact window identity, inherited shortcut conflicts,
  recorder command failures, alert suppression, stale clocks and package rollback.
- Manifest validation, Bash/Python syntax checks, QML checks and `git diff --check`
  passed. Live shell inspection found no Rat Detective QML warnings after fixes.
- Hosted staging used a frozen matching client/Worker with production server-owned
  bots. One connection filled the roster to eight; 18 synthetic connections occupied
  two rooms with a 16-rat cap. Preferred overflow joining and limit-one pagination
  passed. All directory summaries disappeared after disconnection lease cleanup.
  No movement, firing or browser input was driven.
- Production metadata checks passed. **56 built assets matched byte-for-byte**,
  `/health` was healthy, `/status` retained `public-live-v2`, and the old-domain
  redirect preserved path/query. The new public endpoint returned a valid empty
  directory without creating gameplay.
- On Omarchy **4.0.3-1**, all four assignment panels plus empty, stale, unavailable
  and loading states were rendered and inspected as explicitly labeled static
  fixtures. Preferences and shortcut controls were inspected. The final panel keeps
  primary actions visible; the incident log is collapsed and preferences scroll.
- The installed shell's restricted bar API does not expose service lookup. A
  plugin-local shared library now connects the single service to its UI. The shell
  cached earlier QML components during replacement, so supported shell restarts
  were used. No Omarchy installation files were edited.
- A silent static browser fixture verified Brave's origin-derived app identity,
  exact-window focus and fullscreen on Hyprland 0.56. The fixture window and local
  listener were removed. The real game was not opened for automated input testing.
- Static fixture overrides were cleared and the panel closed. The service returned
  to the live production feed. DND remained on; workspace/fullscreen/desktop-audio
  defaults remained off, no shortcut was installed, and no recording was started.

Local evidence is under `output/omarchy-dispatch-2026-09-14/`: deployment logs,
`hosted-check.json`, `production-check.json`, `production-assets.json`,
`panel-fixtures.json`, panel-only PNGs, test logs and the exact published export.
Only the labeled panel preview is included in the public package.

## Limits and next human checks

Actual recording start/stop and saved-file usability, subjective game input,
other supported browsers, vertical-bar rendering and a long-running desktop soak
remain human verification items. The adapter and model tests are not substitutes
for those checks. No public gameplay stress test or real-phone test was performed.

An initial staging burst of concurrent admissions received the existing 503
admission bound. The successful check serialized joins to verify semantics. It is
not evidence of burst capacity or a new player-count guarantee.

Marketplace submission is complete; acceptance and listing are controlled by its
maintainers. See [the companion guide](../omarchy.md) for installation, update,
optional controls and rollback instructions.
