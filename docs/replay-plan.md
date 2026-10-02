# Replay plan: exhibits on the results board

Status (2 October 2026): X1 to X5 are live in production (build `production-2026-10-02-c7c67bb`, protocol 30, era `exhibits`; [release receipt](verification/exhibits-release-2026-10-02.md), [staging receipt](verification/replays-staging-2026-10-02.md)). X6 is next. Tyler agreed the design on 2 October. This file owns the order, status and acceptance for in-game highlight replays. The desktop recorder it replaces was removed the same day ([Omarchy](omarchy.md)).

## Outcome

At the end of every round, the results board shows the round's 3 best moments as short replays, called exhibits. The game plays them back from recorded game data, not video. You can watch each one fullscreen and save it as a video file.

It is done when:

- the server spots funny, chaotic and big moments for every rat and records them as city facts
- each player's game keeps short clips of those moments for the round, within a 16 MB size estimate (overlapping clips share their data)
- the results board plays 3 exhibits: the best from anyone, with at least one that involves you when you had one
- each exhibit has its own camera work, slow motion on the key beat, the game's own sounds and a noir caption
- a save button downloads the exhibit as a video file (WebM with its duration; MP4 only where the browser cannot record WebM)
- facts show how often each kind fires and which exhibits players watch and save

## Decisions (Tyler, 2 October)

- Exhibits appear only on the results board. Nothing shows during play: no kill cam, no capture notice. The game keeps moving.
- The 3 exhibits come from anyone in the round, including bots. At least one involves the local player when they had a moment.
- Detection is rebuilt on the server. Funny and chaotic moments come first, then multi-kills, scoring and trick shots.
- Replays use the game's own sounds.
- Every exhibit has a save button.
- The look is a surveillance tape: grain, a red REC dot, a timestamp and a noir caption.
- Order: detection ships first as data only, then the replay player, then exhibits, then saving.

## Rules for this work

- Production deploys only on Tyler's OK ("push it live"). Staging is free to use.
- Adding the marker message bumps the protocol (29 to 30). Client and Worker ship together.
- No time limits. An exhibit never delays the round. CONTINUE still leaves the board whenever you choose.
- Never read pixels back from the GPU (`readPixels`, `toDataURL`). It freezes the game for 90 to 380 ms ([perf overhaul](verification/perf-overhaul-2026-09-28.md)).
- The replay never touches the live HUD, headlines, kill feed, camera shake or live sound budget.
- Agent browsers stay muted (`&mute=1`). Human playtests stay audible.

## Order of work

| Step | What it gives | Status |
| --- | --- | --- |
| X1 | Server detection and `highlight` markers, recorded as city facts; no picture yet | Live (2 October) |
| X2 | Each client records the last 12 seconds and keeps clips for the round | Live (2 October) |
| X3 | The replay player: isolated view, director camera, slow motion, replay sound | Live (2 October) |
| X4 | Exhibits on the results board, with the tape look and captions | Live (2 October) |
| X5 | Save as video, plus watched and saved facts | Live (2 October) |
| X6 | Tune detection weights from a week of facts | After X5 is live |

Tyler asked for the whole plan at once (2 October), so X1 to X5 ship together.

## Next action

X6: after a week of live facts (era `exhibits`), tune the weights: compare how often each kind fires with how often it is played and saved. On staging, sent flying is half of all moments.

## Detail

- [Detection](replay/detection.md): read for X1 and X6. The moment catalogue, scoring, marker message and facts.
- [Recording and playback](replay/playback.md): read for X2 and X3. The clip buffer, isolated replay view, camera director and replay sound.
- [Exhibits and saving](replay/exhibits.md): read for X4 and X5. Board layout, selection, tape look, captions, save and the final checks.

## Blockers

None. (The Jev data freeze was dropped on 2 October, so exhibits can ship whenever they are ready.)
