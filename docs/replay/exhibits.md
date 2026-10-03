# Exhibits and saving (X4, X5)

Part of the [replay plan](../replay-plan.md), which owns status and order.

## X4: choosing the 3 exhibits

When the round ends, every client picks the same 3 clips (Tyler's playtest, 2 October: "everyone should see the same highlights", plus a personal one; protocol 31):

1. From the server's `highlight` markers, which every player receives, take the highest-scoring moments, at most one of each kind, ordered by score, then time, then id (`sharedExhibits` in `src/replay/ReplayRecorder.ts`). These are Exhibits A, B and C on every screen. The recorder always keeps their clips, past its top-8 limit and byte budget.
2. If your best moment is not among them, it is an extra card, Exhibit D, marked YOURS.
3. A client with no recording of a shared moment leaves that card out; the other letters stay, so B is the same moment everywhere. A player who joined mid-round misses earlier markers and can see a different A–C.

If the round had fewer than 3 moments, show what there is. If it had none, the board looks as it does today.

## X4: the board

The board takes the screen (`GameHud.layoutResults`; Tyler, 2 October: more room for stats, highlights still visible). The spread is up to 1,900 px wide with small margins. The standings are on the left, and a right column of about 40% holds the exhibits above the Case File. Both columns run down to the actions, and the banner is tighter. The exhibits block holds:

- a framed screen, 16 by 9, about 56% of the column wide, that starts playing Exhibit A when the board appears
- beside it, 3 exhibit cards: letter, caption (up to 2 lines) and the rats' names, with the playing one marked

The Case File fills the rest of the column. Its awards fit in 2, then 3, then 4 columns at full size (4 only in a column at least 640 px wide), and only then in smaller type. The fit uses laid-out height, because the stamping's scale inflated `scrollHeight` and forced the smallest type.

Exhibits controls:

- click a card to play it; each exhibit loops until you pick another
- a fullscreen button and a save button on the screen

Cards use text and an icon for the kind, not still images. Still images would need a GPU readback, which freezes the game.

Nothing else changes:

- the board still appears 5 seconds after the win
- CONTINUE leaves at any time and stops the replay
- the stats stay readable beside the screen
- Download stats stays where it is

The live world sound fades down while an exhibit plays ([replay sound](playback.md#x3-replay-sound)).

## X4: the tape look

Each exhibit looks like surveillance footage pulled for a case file:

- light grain and a slight scanline, as CSS over the frame, matching the game's grain
- a red REC dot that blinks, and a timestamp in the corner that counts the round's own time
- a slight cool tint, while the rats keep their full colour, so they stay readable
- a caption bar under the picture: "EXHIBIT A", then the caption

The rats stay bright, as in the live game. Use the existing palette and fonts (Carbon scrawl, Special Elite, Bangers), and the one case red for case moments.

## X4: captions

Each kind has a set of rotating noir lines that use the rats' names, like the case jokes. For example:

- sent flying: "{victim} learns to fly"
- splashdown: "{victim} sleeps with the fishes"
- so close: "{victim} could smell the paperwork"
- from beyond: "{killer} files one last report"
- multi-kill: "{killer} clears the docket"

Write about 5 lines per kind before X4 ships. Keep them short enough for one line on the card.

## X5: save

The save button records the exhibit in the browser and downloads it:

1. The exhibit plays fullscreen from the start, with the board hidden and a small RECORDING mark.
2. `MediaRecorder` records `canvas.captureStream(60)` with the replay bus's audio stream.
3. The file downloads when the clip ends. A 6 second clip takes 6 seconds.

Details:

- use WebM (VP9 and Opus, then VP8), with its duration written in by `fix-webm-duration` so players can seek it; MP4 only where WebM cannot be recorded (Safari). Chrome 153's MP4 recording of the canvas decoded as corrupt after a second or two on staging (2 October), while VP9 WebM was clean
- the canvas recording cannot see CSS overlays, so while recording, draw the REC dot, timestamp, caption and a small ratdetective.online mark inside WebGL, as a screen-space quad with a 2D canvas texture (upload only, no readback)
- name the file `rat-detective-<kind>-<YYYY-MM-DD-HHMM>.webm` (`.mp4` when recorded as MP4)
- record at the canvas's current size; with reduced resolution set, the video is smaller too
- Esc cancels a recording and returns to the board

## Facts

The client tells the server which exhibits were shown, played and saved. The server records these as city facts, so X6 can tune detection against what players enjoy:

- add a small client message, `{ type: 'exhibit', id, action: 'shown' | 'played' | 'saved' }`, validated and rate-limited like other client messages
- record `{ type: 'exhibit', kind, action, human }` in `CityRecorder`
- agent browsers (`agent=1`) never count as human

## Final checks

- A private staging room with bots runs one full round. A muted agent browser reads the board and saves Exhibit A. The saved file is the artifact: it plays, has sound and shows the caption. Keep it in `output/replay/`.
- Tyler plays a round on staging with sound and judges the exhibits. Human playtests stay audible.
- Measure frame time on the results board with an exhibit playing, on Halla and on the weakest laptop available.
- Production on Tyler's OK, with a receipt in `docs/verification/` and an era in `design/data/eras.json`.
