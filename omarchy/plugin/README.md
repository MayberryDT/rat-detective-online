# Rat Detective alert

An Omarchy 4 plugin that tells you when people are playing
[Rat Detective](https://ratdetective.online/): the rat in the bar lights up with the
number of people playing, and one notification says when they start. Clicking the rat
opens or focuses the game. No panel, recording or helper processes.

- Every 30 seconds it reads the public room report (`curl`, at most 256 KiB, 10 s).
- When the public rooms go from no people to some, it notifies once ("Someone is
  playing." or "N people are playing."). It re-arms only after every public room is
  empty of people again. Bots never count.
- No notification while the game is the focused window. Clicking the notification
  opens or focuses the game (`omarchy-launch-or-focus-webapp`).
- `omarchy-shell co.animasai.rat-detective status` prints the current count.

```sh
omarchy plugin add https://github.com/MayberryDT/rat-detective-omarchy.git --enable
omarchy plugin remove co.animasai.rat-detective
```

Version 2.0 replaced the 1.x Dispatch desk (scoreboard panel, launcher helper,
shortcut installer and automatic highlight recording). Clips that 1.x saved stay in
`~/Videos/Rat Detective/Highlights/`; this version never reads or deletes them.
