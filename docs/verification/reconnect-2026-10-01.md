# Reconnect: doubled supplies and a mirrored rat (1 October 2026)

Tyler's report: after a short disconnect, the camera came loose from the rat. He could move the camera in front of the rat's face while it kept shooting the other way, and supplies were "there but not there".

## Causes

The client rebuilds the local rat and the chaos view on every welcome. That includes a reconnect, a room restart (a deploy) and a hibernation wake on the same socket.

- **Doubled supplies.** `ChaosView.dispose` never disposed its supply sites, which sit at the scene root. The new view drew its own 27 sites on top of the old 27. The old ones stayed frozen as they were at the drop, so a claimed site could still look stocked.
- **Mirrored rat.** The local rat turns by writing `mesh.rotation.y`. The welcome restored the server's heading as a quaternion. Past ±90° (the rat facing south of the start), three's default XYZ decomposition gives x = z = π, so every later write to `rotation.y` turned the rat the mirror way. The rat faced the camera and fired away from the crosshair until its next respawn.
- **View snapped north.** The new controller always started looking north (`theta` π), whatever the rat had faced.
- **Claim replay.** A new view's first state counted a running buff as a fresh claim, so the slap, sting and claim moment played again.

## Repair (`7636575`)

- `ChaosView.dispose` disposes and clears `pickups`.
- `RatEntity.applySnapshot` sets the restored heading as a pure yaw.
- `RatController.lookAlongFacing()`, called in the welcome, points the camera along that heading.
- `ChaosView.noteLocalBuffs` treats a view's first state as the baseline.

## Evidence

`node scripts/reconnect-check.mjs --url=<staging> --out=<dir>` joins as a muted agent and looks about 3 rad back. It then closes the socket, waits for the resume and turns.

- **Before** (staging `1a9af7b`), the check fails:
  - supply sites went from 27 to 54;
  - the camera snapped from yaw 3.0 to 0;
  - after the resume, a turn to −0.6 left the rat at −2.54, the mirror image.
- **Before**, the same doubling also followed a staging redeploy during play: 27 sites became 54.
- **After** (staging Worker `bfa820ef`, build `staging-2026-10-01-7636575`), all five checks pass with no page errors:
  - supply sites stayed at 27;
  - the view kept yaw 3.0 through the resume;
  - a turn to 2.4 left the rat at 2.4.

## Not covered

Keys held through the drop are released on reconnect, as before, so you press them again.
