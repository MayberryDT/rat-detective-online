# Private bot observation

Observation is an optional mode for authenticated hosted full-bot fixtures. Open a
`graybox-benchmark-ai-*` room with `&observe=1`, or choose **Observe bots instead**
on that room's title screen. **Play as a rat instead** returns to ordinary entry.
The URL preserves the choice across reloads; it does not change player settings.

Use your usual movement, look, jump and scoreboard bindings. Escape opens the
same pause/settings menu. Touch movement and look still work. The assignment card
says **OBSERVING**, shows leader progress and describes the carrier's activity.

The observer's rat and camera exist only on that client. It is absent from server
player records, bot perception, damage, case and pickup eligibility, scoreboards,
spawn selection and matchmaking occupancy. It cannot fire or operate shot-triggered
controls. Other rats cannot see or target it. World walls and floors still apply;
this is a walking camera, not free flight or a camera attached to a bot.

A ten-rat fixture therefore has **ten bots plus the observer**. An ordinary human
joining the same room replaces a bot normally. Up to four observer connections
are allowed within the existing total socket budget. An observer does not reserve
a rat slot or start a player reconnect grace period. Reload/reconnect gives it a
fresh local camera spawn, without reading, overwriting or consuming a saved human
resume credential. Leaving an ordinary player session still uses its normal
30-second reconnect reservation.

## Server boundary and reuse

Only an active private capacity Worker with its configured fixture identity and
future expiry accepts observation, and only in fixed `graybox-benchmark-ai-*`
rooms. The outer Worker still requires its bearer credential. Public and ordinary
matchmaking rooms reject the flag; clients also refuse an ordinary player welcome
when they requested observation. Never expose a player invisibility toggle.

The welcome's optional `observing: true` identifies a local camera avatar absent
from `players`, without a resume token. Protocol 18 ordinary welcomes retain their
existing validation. Socket attachments retain the observer role and camera spawn
through Durable Object hibernation. Observers consume the same bounded delivery,
chaos and movement feed as players, acknowledging playback but submitting no game
actions. Their disconnect does not change the bot roster or refill timer.

The implementation is reusable source. Each hosted private fixture still expires
and must be renewed using the normal frozen client/Worker workflow in
[tooling](tooling.md). A deployment must include matching client validation and
server role support. No public observation entry point is included.

[Current hosted preview, sewer crossing fixes and rotating playlist](verification/sewer-exits-2026-09-14.md).

[Earlier wall-case and jump fixes](verification/wall-case-jumps-2026-09-14.md).

[Earlier building-corner fix](verification/carrier-corners-2026-09-14.md).

[Original September 14 observation implementation and verification](verification/observation-2026-09-14.md).
