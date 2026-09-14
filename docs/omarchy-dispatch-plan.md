# Omarchy Dispatch desk implementation plan

Proposed September 14, 2026 after Tyler endorsed the Dispatch desk direction and
asked how to implement the whole integration. This is a build plan, not a receipt
of implemented or deployed behavior. Current gameplay remains described in
[current-state.md](current-state.md); the existing companion is in [omarchy.md](omarchy.md).

## Appearance revision — September 14, after the 1.0.0 release

The functional integration above shipped as plugin 1.0.0; see the
[release receipt](verification/omarchy-dispatch-2026-09-14.md). This section records
the subsequent design discussion. Tyler then authorized implementation using
parallel Sol medium agents; see the [appearance receipt](verification/omarchy-appearance-2026-09-14.md).

Tyler liked the noir design study and explicitly requires an option to follow the
user's Omarchy theme. The recommendation is one appearance selector with two named
choices: **Omarchy** (default) and **Rat Detective**. The improved layout and
assignment-specific presentation apply in both. Existing installations without an
appearance setting retain the Omarchy default.

### Theme contract

- Omarchy mode binds to live popup/text/accent/urgent roles from `qs.Commons`,
  active bar values where appropriate, and native font/spacing/control/border
  roles. Follow light and dark theme changes automatically. Do not approximate
  the popup palette by reusing bar foreground or darkening arbitrary text colours.
- Rat Detective mode uses the game's midnight-purple surfaces, pale lavender
  text, subdued brass accents and bundled licensed display/body fonts in its
  content. Preserve Omarchy scaling and keyboard interaction.
- The bar chip and outer popup frame remain native in both modes. The installed
  `KeyboardPanel` owns popup background, border and corner treatment; put branded
  content inside it rather than copying the host's focus/positioning implementation.
- Save the appearance choice on the existing inline `shell.json` widget entry.
  Apply it immediately. It must not alter the global Omarchy theme or restart
  polling, gameplay, recording or the shell merely to change appearance.
- One semantic appearance component supplies colour/font roles to one layout.
  Avoid maintaining separate native and branded panels. Keep accessible focus,
  state labels, reduced motion and contrast checks in both modes.

### Visual work

1. Replace the legacy Pocket Detective concept image and generic detective glyph.
   Reuse the actual game badge for the launcher and branded header; author a
   purpose-made symbolic rat-head asset for the bar and theme-tinted use. Verify
   16/20/24-pixel and high-DPI rendering. Keep source assets and licensing together.
2. Build one real QML Paper Chase slice first: branded header, room/population
   line, assignment file, three delivery marks, top-three standings and a clear
   Enter/Return action. Render it in both appearance modes before extending it.
3. Add Jurisdiction's active zone/warning, Excessive Force's qualifying-kill tally,
   and Closing Time's prominent authoritative clock. Retain explicit separate
   joining, invitation copying, recording and captures. Keep preferences and
   secondary statistics subordinate to the main play action.
4. Use restrained file tabs, stamps and paper texture. Keep readable body text
   upright, stable hit regions and quiet motion. The HTML study communicates
   direction; it is not evidence of QML parity or a pixel-identical guarantee.
5. Verify the actual shell before release: all four assignments plus loading,
   empty, stale and unavailable states; theme changes while open; restart/persisted
   selection; light/dark palettes; top/bottom/vertical bars; scaling and two-monitor
   ownership; keyboard/outside-click close and long labels. Use deterministic
   fixtures on an empty workspace and crop panel-only screenshots. Preserve the
   existing human-only gameplay/input testing policy.
6. After the real QML previews establish the design, package the next plugin
   release and update its screenshots/documentation. This appearance pass needs
   no game Worker/API change. The visual implementation was subsequently authorized and completed; release
   evidence and remaining test limits are recorded separately.

### Skills and feasibility evidence

The general Omarchy skill and its plugins/theming guides were used earlier. The
additional toolkit was located locally at `/home/tyler/Work/build-omarchy-plugins`
(manifest version 0.3.1) during this revision; its skills were not exposed in this
conversation's initial skill catalogue. Read its `omarchy-plugin-design`,
`omarchy-qml-patterns`, `omarchy-bar-widget`, `omarchy-panel-overlay`,
`omarchy-plugin-test` and `omarchy-plugin-demo` instructions, including the theme,
layout, settings and hosted-QML references. Apply these to the next implementation.

Installed source confirms reactive `Color.popups` roles and style/font tokens,
plus the existing native panel lifecycle. QML can implement the logo, bundled
fonts, typography, textured rectangles, file marks and restrained transforms.
Exact spacing and custom artwork must be judged from running QML captures. Do
not edit `/usr/share/omarchy`, replace the bar, or create a second shell process.

## Outcome and architecture

The bar answers whether the city is active. The panel explains the assignment,
shows objective progress and makes playing or returning effortless. Optional
alerts, capture controls and desktop preferences complete the integration.

Keep the browser as the game runtime. Use one Omarchy plugin service for bounded
HTTP polling, normalized state, window observations and notification decisions.
Its bar widget and panel consume that service. Keep the existing plugin ID
`co.animasai.rat-detective` so installed settings survive.

On Cloudflare, active GameRooms publish compact public summaries into a directory
owned by the existing Matchmaker. The HTTP companion API reads this directory;
opening a desktop panel must not enumerate and wake every GameRoom. Gameplay
continues to own scores, clocks, admission, bot replacement and reconnects.

## Observed starting point

- `omarchy/plugin/Panel.qml` owns polling and renders only kills/deaths and round
  elapsed time. It polls every two seconds open and 30 seconds closed. Failed
  reads lack a visible freshness state; count and row parsing still cap at 24.
- `GameRoom.status()` returns one room's population and combat scoreboard.
  `/status` routes directly to the canonical room; it has no assignment summary.
- Matchmaker already supports a known `preferred` room, then capacity-checked
  fallback. Public sockets must still enter through the canonical pool.
- `NetworkManager` uses preferred rooms for tab-local resume. Title preparation
  currently warms the canonical room; invitation routing must account for it.
- The installed Omarchy launch-or-focus helper matches window class or title.
  It builds a shell command string, so arbitrary invitation parameters must not
  be passed through its command interpolation.
- Installed plugin and desktop entry still use the old domain. Repository plugin
  uses `https://ratdetective.online`. Installation is currently a manual copy.

## 1. Reliable service and modern Dispatch panel

Build proposed `src/shared/companionStatus.ts` for the public contract and a
`src/worker/companionStatus.ts` projection from authoritative state. Add
`GET /api/companion/v1/status`; preserve the old `/status` shape for old plugins.
Version the companion contract independently from gameplay protocol 18.

Each summary contains schema version, observation time, room/round identity,
population, assignment ID/title/phase, public objective rows, case-holder name,
current destination or revealed zone information, and committed result. Use
bounded strings, arrays and finite numbers. Never expose resume tokens, private
rooms, actor positions or unrevealed assignment/zone choices.

| Assignment | Primary panel information |
|---|---|
| Paper Chase | Deliveries out of three and current destination |
| Jurisdiction | Personal zone points out of 60, current zone and relocation time; next zone only during its announced warning |
| Excessive Force | Qualifying case kills out of ten |
| Closing Time | Remaining processing time and current holder; winner only from committed result |

Combat totals remain secondary. Preserve names without AI/PLAYER row badges or
bot totals on the scoreboard. Population semantics must be explicit; human
activity thresholds can use aggregate human counts without changing score rows.

Start the API with the canonical room projection, then add the directory in
phase 2 before advertising all-city coverage. The plugin handles an older server
with a limited legacy display and a clear feature-availability state.

Refactor into `Service.qml`, `StatusModel.js`, `BarWidget.qml`, `Panel.qml`, and
small presentation components under `omarchy/plugin/`. Verify installed shell
facades and service lifecycle before wiring them; do not retain a service across
hot reload unless required and tested. Use the supported manifest settings schema.

Suggested starting polling policy: two seconds while open, 30 seconds while
closed, jitter, one request at a time, five-second timeout and retry backoff up
to five minutes. Coalesce refreshes and discard late responses after a room
selection changes. Pause optional polling while locked; resume with one refresh.
Treat these intervals as tunable budgets, not performance claims.

Distinguish loading, live, stale, unavailable and empty. Keep last-known data
visibly dated on failure. Advance only active countdowns from server observations
using local elapsed time; freeze suspended clocks and stop extrapolating stale
data. Reaching zero locally never invents a win or zone transition.

Use the rat emblem, paper surfaces and restrained amber accents through Omarchy
theme tokens. Support horizontal/vertical bars, light/dark themes, keyboard
navigation, constrained panel height, long names and reduced motion. Prepare
static fixtures for every assignment and connectivity state.

Completion: all four assignments display correct progress and lifecycle states;
network failures cannot masquerade as an empty or live city; repeated panel
opens and hot reloads do not duplicate pollers or leak processes.

## 2. All-city activity and accurate room joining

Extend Matchmaker with a separate public-summary table; admission slot hints are
not a scoreboard or reliable connected-human count. Include a freshness deadline,
bounded page size and a pagination cursor. Only list public rooms from this pool.

Publish summaries on population/assignment/result changes with coalescing and
bounded periodic refresh during existing active simulation. Use a room-lifetime
generation and monotonic revision so delayed publications cannot resurrect retired
rooms or overwrite newer observations. Cover canonical title joins that may not
yet have registered in the admission directory. Final departure removes or marks
the summary inactive; expiry handles crashes. Recovery republishes authoritative
state when the room next becomes active. Avoid new timers that keep empty games
running. Public GETs read summaries without gameplay-room fan-out.

Offer room selection with a named Join action. An invitation uses the canonical
game URL and a validated public-room preference, never a raw private-room socket
URL or credential. Reuse bounded preferred-room admission; do not allocate arbitrary
rooms based on untrusted preferences. Full/expired rooms offer normal matchmaking
with explicit feedback about where the player actually landed.

Adapt title preparation so it cannot consume a canonical prepared socket when
the user requested a different room. Retain saved resume precedence for ordinary
Return actions. Explicitly joining another room while a game window exists must
offer a separate join action; do not navigate away from a live rat silently.

Completion: canonical and overflow activity appear once, retired rooms expire,
stale summaries are labeled, preferred joins respect 16 slots and reconnects,
and watching the panel does not create bots, reservations or simulation ticks.

## 3. Launch, return and desktop preferences

Create a single argument-safe launch adapter used by the panel, desktop entry
and optional shortcut. Use a verified app/window identity to focus an existing
game without reloading it. Establish identity from actual supported browser
windows; a title-only match could incorrectly focus an editor or Codex task.
Use fixed, trusted commands with Omarchy helpers, or direct argument arrays where
variable URLs are involved. Repeated clicks must not launch duplicate windows.

Repair the installed launcher URL/icon through an explicit repair action. Preserve
the existing browser profile and tab-local reconnect storage. Describe Return as
focusing the existing window; a new window cannot promise the old rat's identity.

Add optional workspace/fullscreen preferences and a user-selected free shortcut.
Keep default window behavior unchanged until those options are enabled. Validate
Hyprland changes using the current official rule syntax, reload and configerrors.
If play-mode notification suppression or idle inhibition is added, scope it to
the verified game window and release it on close, crash, disable and reload.
Do not infer active gameplay solely from a window being open or take ownership
of the user's global notification/lock preferences.

Completion: launch, return, multiple-window selection and legacy launcher repair
work across the explicitly tested browser set; optional desktop behavior cleans
up completely. Leave pointer-lock and game-input acceptance to Tyler's playtest.

## 4. Optional alerts and capture controls

Add notifications disabled by default, with settings for gathering threshold,
watched-room assignment changes, cooldown and quiet hours. Detect transitions
between fresh observations. First load, server recovery and stale-to-live recovery
establish a baseline instead of flooding historical notices. Deduplicate by room,
round and event; preserve a small expiring receipt across plugin reloads. Suppress
companion alerts while the game is focused and respect system DND through supported
interfaces. Network failures remain panel state, not repeated notifications.

Use installed Omarchy notification and capture command contracts, discovered at
implementation time. Provide Start recording, Stop recording, Open captures and
Copy game link. Show recording state from the recorder, including recordings
started elsewhere; never stop another recording without an explicit user action.
Desktop audio is an explicit recording option; microphone capture stays off unless
selected. Capture controls must recover from cancellation and recorder failure.
Keep files local; sharing links or uploading clips requires its own user action.

Completion: synthetic event sequences prove cooldown/recovery/DND behavior; human
desktop checks verify recorder status and saved files. No automatic recording,
unsolicited uploads or alerts during focused play.

## 5. Distribution and release

Keep source development in this repository and generate a reproducible plugin
export with `manifest.json` at its root, license, assets, scripts and standalone
README. Publish that export to a dedicated plugin repository so normal Omarchy
installation/update works. Do not maintain two manually edited copies. Keep the
existing ID and migrate settings explicitly; validate minimum shell compatibility.

Package launch helpers/assets so an installed desktop entry still works if the
companion is removed. Plugin removal preserves the launcher by default; launcher
removal is a separate action. Add an idempotent staged local installer with backup
and rollback, without deleting unrelated user changes. Record source/export hashes
and versions in each release receipt. Prepare marketplace copy and screenshots
from the tested implementation; publish after release authorization.

Completion: a clean user installation, upgrade from the current manual install,
disable/re-enable, rollback and removal all preserve their stated behavior.

## Checks and delivery order

Implement phases 1 and 3 as the first usable release, then phase 2, phase 4 and
phase 5. Start the data contract and static UI fixtures together within the same
work session; this plan does not request subagents or authorize delegation.

Use focused projection/parser/lifecycle tests, then project typecheck, tests and
build for application changes. Add directory tests for publication races, expiry,
pagination, private-room exclusion and no game-room calls during summary reads;
admission tests for preferred/full/expired rooms and resume/title interactions.
Exercise pure plugin model functions with fixtures and validate the manifest.
Test process cleanup and shell rendering separately from game input.

Every gameplay preview uses a frozen matching client and hosted Worker with normal
server bots and the 16-rat cap; follow [tooling.md](tooling.md). Agent browser
inspection stays muted. Human playtests stay audible. Label static fixtures and
synthetic room tests accurately. Keep production release, marketplace publication
and any Git commit as explicit delivery actions rather than consequences of this
planning document. Use existing session authorization when supplied.

For rollout, publish the additive server API first, verify old plugin/game behavior,
then install the new companion. Invitation changes require a matching hosted
client/Worker preview. Rollback can restore the plugin while the additive API
remains. Preserve existing production room and namespace identities throughout.

## Sources and open implementation checks

Local sources: `GameRoom.status`, `Matchmaker.fetch/assign`, `NetworkManager`,
`assignments.ts`, and installed Omarchy shell/launcher code, inspected September 14.
Historical GBrain page `sessions/2026/09/rat-detective-art-release-2026-09-07`
confirms the earlier companion release; its old deployment/runtime details are
superseded by current project docs.

- [Omarchy shell plugins](https://omarchy.org/manual/shell-plugins/): component kinds,
  settings, validation and Git distribution; installed shell source governs the
  exact available service interfaces.
- [Cloudflare Durable Object rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/): lifecycle and state design reference.

Before shipping, resolve and record actual browser window identity, third-party
plugin service access, lock/DND observation, recorder control/status API and
measured summary publication overhead. These need implementation evidence; they
do not require Tyler to repeat known project context.
