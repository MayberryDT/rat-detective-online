# Handoff: desktop sound effects silent, music works

**Subsequent user update:** Tyler confirmed sound is working again and asked the
gameplay task to restart its preview. The cause and external fix were not reported
to this task. The investigation below is historical; do not repeat it solely
because this handoff exists.

## Task and scope

Investigate Tyler's **desktop/browser audio**, separately from ongoing Rat Detective
gameplay work. Tyler reports that sound effects are silent in Brave on this
computer, both in the private preview and on the live site, while music works.
He then tested on mobile and confirmed that sound effects work there. He suspects
his computer and requested this handoff for another agent. The cause is **not yet
confirmed**; mobile success does not by itself exclude a desktop-specific game bug.

Do not change Rat Detective's audio mix, deploy the game, commit its working tree,
or revert gameplay changes as part of this investigation. The repository at
`/home/tyler/Projects/rat-detective` is intentionally dirty with the pickup
refinements. Coordinate any demonstrated game-code defect with the gameplay task.

## User preferences and relevant history

- **Human playtests must remain audible.** Do not mute Tyler's browser, site or
  system while investigating. Only agent testing should be silent; use a separate
  test browser with muted output when checking audio processing.
- Earlier in this conversation Tyler requested muted agent tests, then clarified
  that his own playtest must have sound. A previous request to have him mute the
  localhost site received the reply that the agent had already muted whatever he
  was hearing. The precise earlier mute action is not established by this handoff;
  do not assume it caused the present symptom or reset unrelated settings.
- The game's `mute=1` query flag is loopback-only. It suspends Web Audio and mutes
  title music for agent tests. The human preview URL below has **no mute flag**.
- Read the available **omarchy skill** before changing desktop/system audio
  configuration. Follow applicable host instructions. Preserve unrelated audio
  applications and routing; avoid broad resets or restarting the desktop/browser
  without establishing that it is necessary and coordinating disruption.

## Environment and reproduction

- Desktop host identifies as **Veelox**, Linux/Omarchy, PipeWire/PulseAudio API.
- Affected browser: **Brave**, executable `/opt/brave-origin-bin/brave`.
- Permanent reproduction URL: <https://ratdetective.online/>.
- Current human preview:
  <http://127.0.0.1:5193/?room=graybox-benchmark-match-pickups-r4>.
  This is a frozen client relaying to a private hosted Worker with production-style
  server bots/matchmaking. It expires **September 11, 2026, 9:44 PM Pacific**.
  Do not substitute the old port-5190 local workerd/browser-bot preview.
- Ask Tyler to leave an affected game tab open if needed. During this investigation
  the connected browser inventory had no Rat Detective tab available, so the
  failing tab's audio context, console and requests could not be inspected.

## Checks already completed

1. Tyler hears **music but no sound effects** in desktop Brave, including live.
   Tyler independently reports **working sound effects on mobile**.
2. `/sounds/gunshot.mp3` returns HTTP 200, `audio/mpeg`, 2,089 bytes from both the
   local preview and production. The local MP3 decodes with ffmpeg: about 0.13 s,
   mean -22.8 dB, peak -1.4 dB. It is not an empty/silent file.
3. Separate temporary-profile, headless tests ran with `--mute-audio`, keeping
   physical output silent while leaving the normal Web Audio startup path intact.
   Tested Chromium against preview and live, and Brave against preview.
   Each decoded 27 effects buffers with nonzero sample peaks and no decode errors.
   After a user-gesture-marked reroll click, the effects context changed from
   `suspended` to `running`; four short effects buffer sources started.
   No relevant runtime errors were observed. **This checks loading and source
   startup, not audible output, the full audio graph, or Tyler's existing profile.**
   These tests stayed on the title screen; they did not verify gunfire in gameplay.
4. Read-only PipeWire inspection during the investigation found an active Brave
   playback stream unmuted at approximately 80%, connected to the same sink as
   other applications. No active game tab was identified at that time, so this
   does **not** establish the affected Web Audio stream's routing or gain.
5. No game source, browser settings, or system audio settings were changed during
   the sound-effects investigation. Isolated test browsers were closed afterward.

Temporary probe scripts, if still present, are `/tmp/rd-audio-probe.mjs`,
`/tmp/rd-audio-live-probe.mjs`, and `/tmp/rd-audio-brave-probe.mjs`. They instrument
audio context creation, decoding and source starts in disposable profiles. They
are diagnostics, not permanent tests; their console output was not saved as a
durable artifact. The initial probe accidentally selected an extension background
page and was inconclusive; the successful runs explicitly selected a page target.

## Useful code context

- `src/ui/TitleMusic.ts`: music uses a streaming HTML `Audio` element.
- `src/session/createStage.ts`: effects use a Three.js `AudioListener` and its
  Web Audio `AudioContext`.
- `src/session/GameSession.ts`: title gestures resume a suspended effects context.
  `TitleScreen` forwards pointer/click/key gestures, including during gameplay.
- `src/audio/GunshotAudio.ts`, `EntityAudio.ts`, `FeedbackAudio.ts`, `FoleyAudio.ts`:
  effects generally skip playback unless their context is `running`.
- `src/audio/previewMuted.ts`: the explicit loopback-only test mute flag.

## Suggested next steps

Inspect the **actual failing Brave tab first**: effects requests/decodes, console
errors, context state after a real gesture, and whether source playback reaches
the output graph. Check the corresponding live PipeWire stream and routing while
the symptom is occurring. Compare HTML media with a known Web Audio sample in the
same profile, then compare a clean profile if needed. Site permissions, Shields,
extensions, context interruption and stream routing are hypotheses, not findings.

Make the smallest evidence-supported correction. Validate with Tyler hearing both
music and effects in desktop Brave, ideally including local gunfire and a nearby
world effect on the live site. Report the confirmed cause, exact changes and any
remaining limits to the gameplay task. No game release is needed unless a game
defect is independently demonstrated and addressed through that task.
