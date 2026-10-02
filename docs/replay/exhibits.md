# Exhibits and saving (X4, X5)

Part of the [replay plan](../replay-plan.md), which owns status and order.

## X4: choosing the 3 exhibits

When the round ends, the client picks 3 clips from its shelf ([playback](playback.md)):

1. Take the highest-scoring clip that involves you, if you had one.
2. Add the highest-scoring clips from anyone until there are 3, at most one of each kind.
3. Order them best first, as Exhibit A, B and C.

If the round had fewer than 3 moments, show what there is. If it had none, the board looks as it does today.

## X4: the board

The results board keeps its layout (`GameHud.layoutResults`): standings on the left, Case File on the right. The exhibits go in the right column, above the Case File:

- a framed screen, 16 by 9, that starts playing Exhibit A when the board appears
- below it, 3 exhibit cards: letter, caption and the rats' names, with the playing one marked
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

- use MP4 (`video/mp4;codecs=avc1,mp4a`) when `MediaRecorder.isTypeSupported` allows it, otherwise WebM (VP9 and Opus)
- the canvas recording cannot see CSS overlays, so while recording, draw the REC dot, timestamp, caption and a small ratdetective.online mark inside WebGL, as a screen-space quad with a 2D canvas texture (upload only, no readback)
- name the file `rat-detective-<kind>-<YYYY-MM-DD-HHMM>.mp4`
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
