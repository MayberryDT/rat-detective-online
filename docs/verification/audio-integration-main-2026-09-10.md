# Audio integration into main — September 10, 2026

## Scope and provenance

Tyler requested finding the separate audio worktree, integrating its accepted changes into the current game on `main`, and committing all changes. No push or deployment was requested or performed.

- Source task: **Audit sound effect opportunities**.
- Source worktree: `/home/tyler/Projects/rat-detective-chaos-foley`, branch `codex/chaos-foley`.
- Applied audio delta: `29620ba96ea985f48c7dd424ae05324c8d894433` (**Add approved cartoon foley and restrained noir cues**).
- The preceding source commit, `1b7463c`, contains an older captured game snapshot. It was not merged into the current game.
- Current game checkpoint: `bf2cd0d` (**Preserve approved assignments, noir lighting and full lobby scoreboard**), committed before integration. `main` was fast-forwarded to that checkpoint, then the audio delta was cherry-picked with source attribution.
- Prior audio acceptance and commit history: GBrain `brain:sessions/2026/09/rat-detective-chaos-foley-worktree`. The source worktree remains clean and intact.

## Integration

The accepted 13 WAV cues and their runtime catalog are byte-identical to the source commit: jump, heavy landing, wall bonk, three corpse accents, two case contacts, name tick/stamp, damage confirmation, respawn tock and restrained noir victory. The total WAV payload is 239,372 bytes, mono PCM16 at 24 kHz. All WAV durations match the manifest. Rejected extra incident and launcher sounds remain excluded from playback. Existing gun, rat, incident and music systems retain their implementations and mix.

Four overlaps were resolved deliberately:

- `GameSession`: retained the full held-Tab scoreboard and its lifecycle while adding foley construction, event handling and cleanup. The rat-position argument used by interior lighting remains.
- `ChaosView`: retained viewer identity for own/enemy cheese treatments while wiring world foley; cosmetic audio-only events do not create particles or scenery reactions.
- `GameHud`: retained rotating death/result quips and animation while adding the respawn tock and accepted victory cue.
- `current-state.md`: retained the latest game history and added this integration. Old audio-worktree previews were not relabeled as current.

The current protocol remains **5**; cosmetic sound annotations are optional, validated and bounded inside the existing impact budget. Assignment scoring, personal Chain deliveries and case respawns, case missile tuning, bot behavior, lighting, and local/opponent outlines are preserved. Matching client/server builds are needed to hear the shared physical accents.

## Actual checks

| Check | Result |
|---|---|
| Focused audio/session/HUD/scoreboard/physics checks | 98 passed in 10 files |
| Full Worker suite | 107 passed in 18 files |
| Full client suite, bounded to four workers | 566 passed in 85 files |
| Node script suite | 22 passed |
| Total full-suite tests | **695 passed** |
| Application and test TypeScript | Passed |
| Production client build | Passed; `index-5zQb88HS.js`, unchanged `index-BRaXkHdM.css` |
| Visual fixture build | Passed |
| Asset provenance/durations/catalog identity | All 13 approved clips and catalog matched |

The three full-suite commands are the components of `npm test`, with `--maxWorkers=4` added only to the client suite to preserve the established local concurrency bound. Both builds emit the existing advisory about chunks above 500 kB. Local logs and byte hashes are under ignored `output/audio-integration-2026-09-10/`.

These are automated code/protocol checks and builds. **No new live multiplayer validation, human listening/playtesting, browser gameplay/input automation or screenshots were performed for this integration.** Prior audio-worktree human acceptance does not establish a playtest of the combined build. The immutable port-5190 preview remains the prior pre-audio game. No service, Worker or production deployment was changed.
