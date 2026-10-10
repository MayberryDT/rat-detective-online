# Results highlight replays

[Replay plan](../../docs/replay-plan.md) · [Current playback decisions](../../docs/replay/playback.md)

[HighlightDetector](../worker/HighlightDetector.ts) selects server moments from recorded game data. [ReplayRecorder.ts](ReplayRecorder.ts) keeps client data and selects/retains shared exhibits; [ReplayDirector.ts](ReplayDirector.ts) owns the POV camera; [ReplayStage.ts](ReplayStage.ts) plays the reconstruction; [ReplayAudio.ts](ReplayAudio.ts) and [captions.ts](captions.ts) provide presentation. [Exhibits](../ui/Exhibits.ts) owns the results-board controls; [saveClip.ts](saveClip.ts) exports the clip.

Exhibits never appear during play and never block the next round. Everyone gets the same A–C and their own D when available. Playback follows the actor’s recorded look through the gameplay shoulder camera at real speed; older orbit/cut and slow-motion proposals are superseded. Preserve bounded recording, overlapping clip sharing, disposal, restart behavior and save duration.

[Scripts guide](../../scripts/README.md) points to exhibits/replay checks and their artifacts. Browser-input checks require a request; a successful data fixture alone does not prove human playback or export quality.
