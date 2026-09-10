# Sixteen-rat lobby, world audio and case deaths — September 10, 2026

[Play the current desktop preview](http://127.0.0.1:5190/?room=graybox-benchmark-ai-sixteen-v20&diagnostics=quiet&lighting=pools). The private room runs **16 bots before humans join** and replaces one bot per human. Expires **September 10 at 3:33 PM Pacific / 22:33 UTC**. Phone relays are stopped at the user's request. Production is unchanged.

## Changes

- Current source admits **16 total rats**, with 24 socket slots including pending connections. Automatic matchmaking partitions overflow at 16; its normal eight-rat backfill remains. The explicit private `--full-lobby` fixture fills every free slot and refills departures after ten seconds.
- All world/physics sounds share one three-dimensional distance curve: gunshots, remote rat squeals and deaths, ragdoll impacts (including your own distant corpse), case hits/taken/drop, Popcorn, delayed thuds, the nearest weaponized-case buzz and the nearby Dispatch siren. Gain is full through eight units, approximately 25% at 50, 6.6% at 100, 1.2% at 250, and 0.44% at 500. Gun base gain is .30, down from .40. The close foley and siren range fades multiply this curve, retaining their stricter cutoff. Foley, case buzz and active sirens follow changing distance; short cues use their event origin. Local UI/respawn/death-screen feedback and music remain personal. Audio pools, priorities, cooldowns and bounded occlusion remain.
- Evidence Tampering case deaths award **no player kill or case point**. Only the victim's death count increases; health, corpse and respawn still update. Explicit neutral ownership survives snapshot restore and corpse chains. A player who subsequently shoots a corpse still owns that redirected hit. Case redirect ownership continues to protect the shooter from self-damage.
- The feed uses **24 rotating named paperwork jokes**, including “The case rested. On Captain Crawley.” and “Captain Crawley was filed under FLATTENED.” The victim's actual name is inserted safely. Ordinary player-attributed deaths retain their normal feed/scoring.
- Protocol **7** represents uncredited damage/deaths explicitly with null attribution and the Tampering cause. Strict decoding rejects unknown/missing causes and mixed attribution. Client and Worker were published together.

Ball speed 175, gravity −25, restitution .9, lifetime five seconds, 256-ball/16-corpse limits, all eight Tampering cases, controls, camera, assignments, lighting and navigation tuning remain.

## Verification

The previous human playtest was checked directly through authenticated room status: **24 total rats, 23 bots, one human** after our earlier probes had disconnected. A bot had yielded to the user. Its curated client diagnostic summary is in `output/sixteen-rat-tuning-2026-09-10/prior-playtest-summary.json`: 65 visible reports, zero invalid packets/reconnects, up to 256 rendered balls, worst reported frame p95 33.4 ms. This does not establish the cause of cheese-ball choppiness or prove that reducing the population resolves it.

**752 tests pass**: 127 Worker, 600 client, 25 scripts. `npm run typecheck`, `npm run build`, `npm run visual:build` and `git diff --check` pass. Existing bundle-size advisories remain. Focused checks cover real world-source routing, near/far/vertical gain, moving-listener fades, personal UI levels, pooling/cleanup, 16-rat admission, neutral damage/death persistence, respawns, compact/raw owner decoding, no-self damage, corpse restore, normal kill credit, joke rotation and session feed selection.

An initial full run hit the previously intermittent dispersed-AI progress assertion; it passed alone and in both later full client runs without AI changes. Another run exposed the launch-momentum test's random outward heading: city containment can legitimately shorten it. That controller test now chooses an inward heading while preserving its displacement assertion; seeded launcher tests retain random heading/containment coverage. No launch gameplay was changed. The first relay readiness request arrived before listening and was refused; it was repeated after the service reported ready.

The new hosted full-lobby probe verified:

| Transition | Total rats | Bots |
| --- | ---: | ---: |
| Before joining | 16 | 16 |
| First human joins | 16 | 15 |
| Second human joins | 16 | 14 |
| Second leaves and refill completes | 16 | 15 |
| Both leave and refill completes | 16 | 16 |

The existing client observed exactly one bot leave when the second human joined. **411 valid snapshots, zero invalid packets/errors**, peak 132 balls. Both probes closed; the user room was left full. Served JS matches the frozen build exactly.

A separate private room ran a 26-second forced Tampering check: **6 uncredited case deaths**, eight cases visible in snapshots, up to 4 neutral corpses, **743 valid snapshots, zero invalid packets/errors**, peak 156 balls. Each case death carried null killer ID/name and the victim's actual name. That check room was cleaned up; the user room's incident was not forced.

These are protocol/code checks, not a listening, GPU, gameplay-input or sustained-capacity certification. The user handles the new build's gameplay and sound review. No automated pointer-lock/input testing was performed.

## Private deployment

- Worker: `rat-detective-capacity-test`, version `45bc9d1f-689f-45cc-98a7-b5aa768cc8fa`; protocol 7.
- Room: `graybox-benchmark-ai-sixteen-v20`, world version 2, actual generated seed `1092212759`. Prewarmed full-lobby rooms use their generated seed; the benchmark fetch-path seed override does not apply to this initialization path.
- Client: `/assets/index-DclP5NmF.js`; SHA-256 `71134d012991287e707d5037201d04760924279a6da876d674007c9bcf998fe8`.
- Deployment receipt: `output/hosted-capacity-deployment-2026-09-10T18-33-29-856Z/deployment.json`.
- Desktop service: `rat-detective-full-lobby-preview.service`, loopback port 5190, stops at expiry. The old Wi-Fi and Tailscale preview services are inactive.
- Readiness, incident, test and build receipts: `output/sixteen-rat-tuning-2026-09-10/`.

Built from the existing uncommitted working tree on `main`; no commit or production deployment. Prior context: `brain:sessions/2026/09/rat-detective-full-lobby-preview-2026-09-10` and the [network implementation receipt](network-fixes-2026-09-10.md). The [24-rat preview receipt](full-lobby-preview-2026-09-10.md) is historical.
