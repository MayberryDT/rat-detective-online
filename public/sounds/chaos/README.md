# Deliberate cartoon foley bank

13 offline-rendered WAVs for the September 10, 2026 noir revision. Total WAV size: **239,372 bytes**. Mono, 24 kHz, signed 16-bit PCM; cues last 75 ms–2.1 seconds. There are no ambient beds.

Regenerate from the repository root with `python3 scripts/generate-chaos-foley.py` (Python standard library and ffmpeg). The deterministic generator produces `manifest.json` measurements. Runtime volume, cooldown, range and priority live in `src/audio/foleyCatalog.ts`. Superseded files move to ignored `output/rejected-foley-assets/` and are not shipped.

## Sources and current direction

Recorded components come from retained CC0 **Kenney Impact Sounds 1.0**, **XenosNS door-stopper twang** and **cabled_mess Jump_C_08**. Exact files, licenses, creator URLs and source hashes are in [the retained source notes](../../../assets/audio/cartoon-foley/README.md). Previously used balloon and slime recordings remain historical source material; neither is used in this bank.

The generator crops, filters, layers and resamples those recordings. Eleven approved clips are byte-identical to the preceding revision: jump, heavy landing, wall bonk, corpse bounce/kick/hit, case floor/wall, name tick/stamp and hit confirm. Their runtime gains are unchanged.

Only countdown and victory were remade. Countdown is a 550 ms low wooden clock tock with damped bass body and a soft mechanical tail, without bells or chimes. Victory is a 2.1-second muted D-minor jazz phrase over low plucked bass, a quiet minor-sixth voicing and soft brush strokes. A small falling horn bend and case-closed thock supply the comic touch. Victory gain is reduced from .78 to .43; countdown uses .30. The musical components are original offline synthesis, not live instrument recordings. No new external source was incorporated.

Grow, charge, split, kill confirm and unstick are removed from assets, catalog and client playback. Launchers remain silent. Existing gun, rat, mouth-pop, feedback and music assets and gameplay behavior are preserved.

## Playback

The client decodes at most four clips concurrently, loading personal cues first. Eight reusable voices/panners include at most three simultaneous world accents, with at least 160 ms between world onsets. Per-cue/per-source cooldowns drop excess events immediately. World accents require nearby visible, unobstructed sources, fade with distance and pan relative to the camera. Personal feedback stays centered. The final name stamp stops remaining name ticks. Victory gets exclusive use of this new bus until its short phrase ends; other cues are dropped rather than queued. Reset, disable and disposal stop playback. Hidden/disconnected sessions stop the new bus; initial, duplicate and stale snapshots do not replay old impacts.

All clips are distinct, non-silent and below full scale with zero-valued faded edges. These checks establish file integrity; the two new noir cues still require human listening. See [trigger and mix notes](../../../docs/chaos-foley.md).
