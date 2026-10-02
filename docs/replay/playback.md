# Replay recording and playback (X2, X3)

Part of the [replay plan](../replay-plan.md), which owns status and order.

The game already rebuilds the world from server messages. A replay feeds recorded messages through a second, isolated copy of the same view code. Effects, bodies and sounds then come back without being rebuilt by hand.

## X2: record

Each client keeps a ring buffer of the last 12 seconds:

- decoded server messages in arrival order, stamped with server time: movement frames, chaos states and events (shots, hits, deaths, heals, respawns, pickups)
- the local rat's own track at 30 Hz: position, mesh rotation, aim, held weapon, and its shots, hits and deaths

Store decoded messages, not wire strings. `ChaosDecoder` is stateful (`predict-v1` motion, ball handles, `put`/`drop` lists), so a wire string from the middle of the stream cannot be decoded on its own. Each decoded chaos state is complete. Copy it if the decoder reuses arrays between frames.

The local rat is not in the server's movement frames: the game moves it directly (`RatController`). Record it in client time and convert with `serverOffset` (already kept in `GameSession`). Replay it like any remote rat.

When a marker arrives, wait until its trail has passed, then copy the window into a clip. Keep clips for the round:

- the 8 highest-scoring clips
- plus the best clip that involves the local player, if it is not already in the 8

At about 0.5 MB a clip, the shelf stays under 8 MB. The buffer is about 1 MB. Clear both on `welcome` and `gameReset`. A round-winning marker's trail ends before the board appears (the board shows 5 seconds after `gameWon`).

## X3: the replay view

One `ReplayStage` owns everything a replay creates. It plays a clip into its own `THREE.Group`:

- a second `RemotePlayers` for every rat in the clip, the local rat included
- a second `ChaosView` in replay mode for balls, splats, stains, bodies, traps, lasers and the case

`ChaosView` builds HUD pieces today. Replay mode must skip them:

- the case marker, case arrow and buff bar on `document.body`
- `DispatchHud` and the fix beacons
- `headlines.explain`
- live audio feedback (send it to the replay bus instead)

The replay must not create a second `FeelDirector`, `GameHud` or `Headlines`. Replay rats and effects use their own pools, not the live ones.

### Sharing the scene

The city is shared. Live and replay objects are kept apart with three.js layers:

- live rats and live chaos on one layer, replay rats and replay chaos on another
- the live camera sees the city and live objects
- the director camera sees the city and replay objects

While an exhibit plays, the next round may be running behind the board. Its rats must not appear in the replay, and the replay must not appear in the live view.

### Rendering

There is one canvas and no post-processing pass; grain and vignette are CSS overlays (`ScreenFeel`). Two ways to draw an exhibit:

- in the board's frame: draw the replay with the director camera into the frame's rectangle using `setViewport` and `setScissor`, after the live frame
- fullscreen: draw only the replay, with the live scene hidden

Both draw the city twice in one frame when the frame is used. That is acceptable on the results board, where you are not playing, but measure it on Halla and a weak laptop.

### Ragdolls

Bodies follow the server's corpse position, and `RatCorpseChain` adds the limbs on the client. Step the chain at a fixed rate during a replay, so a body falls the same way each time you watch.

## X3: the director

Each kind of moment has its own shot. The director picks the camera from the clip's actors and the moment's position:

- trick shots: behind the shooter, then follow the ball to the hit
- sent flying, splashdown and body blow: follow the body
- pileup and Big Cheese: a wide, slow orbit around the spot
- long shot: over the shooter's shoulder, then cut to the victim
- multi-kill: behind the killer, a quick cut at each kill
- so close and carrier down: on the carrier, then a pull back to show the drop-off or zone

On the key beat, time slows to 30% for about 1 second, then speeds back up. The camera never shakes. It avoids walls with the same ray checks the shoulder camera uses. With reduced motion turned on, the camera holds still shots and slow motion is shorter.

## X3: replay sound

The replay plays the game's own sounds from its recorded events, through a new replay bus in `src/audio/PlayerAudioMix.ts`:

- the replay bus feeds the effects bus, so the master and effects sliders apply
- while an exhibit plays, the live world bus fades down, because the next round may be running behind the board
- replay voices have their own small budget, so they never take the live `admitWorldVoice` slots
- the same bus feeds a `MediaStreamAudioDestinationNode` for saving ([exhibits](exhibits.md))

`EntityAudio` uses a shared voice pool today. It needs to take the bus to play on.

## Checks

- A dev entry, `?replay=dev` on a private staging room, lists the clips kept this round with their size, and plays the newest fullscreen.
- Memory stays under 8 MB for clips after a full Excessive Force round.
- A replay leaves no DOM nodes, pooled meshes or audio voices behind. Count them before and after 20 replays.
- Playing a clip twice shows the same body fall.
