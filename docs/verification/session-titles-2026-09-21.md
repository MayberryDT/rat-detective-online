# Session date/time/mode titles — 21 September 2026

Tyler requested rewriting all session titles before testing. Replaced shortened
session IDs and Last session labels with local `YYYY-MM-DD HH:mm · Mode` labels.
Session IDs remain unchanged for filtering and reels. Multiple observed modes
are listed in order; missing dates/modes are explicitly unavailable.

The catalog previously did not retain modes. Schema 5 adds unique per-session
mode rows. The browser connector reads the existing assignment HUD `data-mode`
written by `src/prototype/DispatchHud.ts` and attaches only one of the four known
modes to session-start and heartbeat messages. The helper records them after
normal session/document/sequence validation; stale sessions cannot relabel data.
No new game build/deployment is required for this local connector update.

All seven existing session labels now use dates/times. Reviewed saved media
frames to recover modes for the four sessions with clips: Excessive Force;
Excessive Force/Jurisdiction; Jurisdiction/Closing Time; and Paper Chase. Three
empty sessions lack recoverable mode evidence and say Mode unavailable. A mode
list reflects observed evidence, not a claim of exhaustive historical coverage.

Verification: 18 helper/service/audio/export/session tests, 24 plugin tests and
37 QML checks pass. Coverage includes schema-4 upgrade preserving session dates,
persistence, mode deduplication, invalid modes, stale-document rejection, connector
origin gating and unknown/missing HUD state, and local date/title formatting.

Installed the model, library/service modules in plugin and durable locations,
and the connector in both installed copies. No dedicated game browser was running;
the next launch loads the connector. Backed up the catalog and installed code,
migrated/backfilled metadata, restarted the idle helper and the shell. Verified
new shell process, ping, no Rat Detective load errors and a fresh enabled-helper
lease. Read session labels through the live API and installed model. Session
identities/timestamps and every clip's path/title/trims/favorite/status match the
pre-update database. Original media is untouched.

Private backups, frame evidence, tests and installed hashes are under
`output/session-titles-2026-09-21/`. Native UI interaction was not rerun; Ibara's
operator pause was left in place. Future real-game mode capture remains a human
acceptance step, with the connector/helper seam covered by deterministic tests.
