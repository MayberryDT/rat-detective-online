# Cartoon foley feedback — September 9, 2026

Rebuilt after the user rejected the earlier wood-note cues as mobile/casino sounds. Run `python3 scripts/generate-feedback-sounds.py` with ffmpeg installed. All layers come from source foley samples; there are no synthesized notes, chord patterns or oscillator sweeps. Cuts, fixed-rate resampling, filtering and overlapping impacts provide the exaggeration.

Source attribution, licenses and retained files: [cartoon-foley provenance](../../../assets/audio/cartoon-foley/README.md). Source files are not sent to browsers. The accepted Popcorn recording and 0.4-second timing are untouched.

| Cue | Edit | Length |
| --- | --- | --- |
| Case pickup (now the victory and case-point cues only) | Weighty grab, wound spring/ratchet, emphatic paired metal latches | 0.70 s |
| Other carrier (now the Dispatch ready cue only) | Short snatch and latch pair, quieter in the mix | 0.31 s |
| Menu open | Short scrape, wooden snap and spring twang | 0.27 s |
| Menu close | Scrape and clack shut | 0.22 s |
| Death | Broad slapstick whack and loose spring under the rat voice | 0.66 s |
| Respawn | Quick spring kick, upright snap and latch | 0.45 s |
| Dispatch | Brief mechanism ratchet, heavy stamp and rattling hardware | 0.50 s |
| Roulette tick | Dry wooden mechanism click | 0.055 s |

24 kHz mono 16-bit PCM, normalized to 0.86 peak before runtime gain. Eight feedback voices maximum; chatter reserves space for important events and per-cue cooldowns suppress repeated snapshots. Case hits share the mild global distance gain of gunshots/rat reactions. Final character and mix require the user's listening playtest.

## Supply claims and Ironclad (synthesized)

The supply and armour cues are the exception: original, deterministic synthesis from `python3 scripts/generate-pickup-sounds.py` (standard library only, 48 kHz mono, 0.86 peak). Each claim is its pickup foley plus a short noir sting and a signature sound. Every Ironclad sound is a heavy plate: a falling sub thump, a dense short body of low modes and one dark anvil-bell ring, with no tin hiss.

| Cue | Design | Length |
| --- | --- | --- |
| Armour clang | Cheese off the coat: the heavy plate alone, kept short for repeats | 0.34 s |
| Ironclad claim | Coat seats with a dark scrape, locks on with a heavier plate, then two low trombone hits rising a fourth | 0.95 s |
| Hot Pursuit claim | Engine rev blipping up into the rising whoosh, then a snare brush, an upright-bass pickup run and a muted-trumpet stab | 0.78 s |
| Quick Fix claim | Lid click, bandage sweep and rubber snap over a heartbeat that slows and softens into a calm vibraphone Fmaj7 | 1.00 s |
| Stakeout claim | Lens ratchet and click, a soft radar sweep, the low minor-third brass and a muted-trumpet "aha" bending up | 0.96 s |
| Stakeout shutter | One dry leaf-shutter click pair, once per rat revealed | 0.08 s |
| Pip tick | One small glassy tick, once per health pip refilled | 0.05 s |
| Card slap | Unchanged | 0.22 s |

## The case (synthesized, 1 October)

Tyler asked for the case's sounds to be redone across the board. They are made by `python3 scripts/generate-pickup-sounds.py` beside the supply claims (48 kHz mono, 0.86 peak):

| Cue | File | Design | Length |
| --- | --- | --- | --- |
| Your pickup | `case-claim` | A weighty leather grab, both brass latches slamming shut one after the other, a riffle of papers and a low thump | 0.62 s |
| You lost it | `case-dropped` | The latches pop, papers spill, and a muted trombone sags down a minor third | 0.95 s |
| Someone else took it | `case-snatched` | A quick snatch and latch over two low upright-bass notes | 0.62 s |
| Knocked loose | `case-loose` | A leather thud and fluttering papers | 0.46 s |
| A ball on the case | `case-thwack` | Leather thwack, latch jingle, a little paper | 0.30 s |
| The grip takes a hit | `case-knock` | A hard knock and latch rattle, played faster as the grip weakens | 0.24 s |

## The arsenal (protocol 27, 1 October)

The Mousetrap's foley is edited from the same retained cartoon recordings by `python3 scripts/generate-feedback-sounds.py` (24 kHz). There is no synthesis in it.

| Cue | File | Edit | Length |
| --- | --- | --- | --- |
| Trap set down | `trap-set` | A pine thunk, the bar latching and a short creak of the spring | 0.34 s |
| A rat snapped | `trap-snap` | A sharp crack of the bar, the steel slapping home, a body thump and the big door-stopper spring twang | 0.68 s |
| A ball chips it | `trap-splinter` | One small dry wood splinter | 0.10 s |
| Broken | `trap-break` | The base crunches, three splinters, then the freed spring sags out a slow, low boing | 0.95 s |
| No room to set it | `trap-refused` | A dull, low-passed wooden clack | 0.20 s |

The Laser and the three weapon claims are original deterministic synthesis from `python3 scripts/generate-pickup-sounds.py` (48 kHz, 0.86 peak):

| Cue | File | Design | Length |
| --- | --- | --- | --- |
| Laser fired (yours on the press, others' with the beam) | `laser-fire` | Pulp ray gun: a 70 ms charge whine climbing to 3 kHz, then a warbling FM "pew" diving from 2.6 kHz, a crackle of static and a soft sub thump | 0.62 s |
| Laser strikes | `laser-hit` | A hard broadband crack with a bright inharmonic ping, then frying, spitting static | 0.50 s |
| Tommy Gun claim | `pickup-tommy-gun` | The bolt racks and slams home, the drum slaps on, a brush and two short trombone hits a fourth up | 0.85 s |
| Laser claim | `pickup-laser` | The ray gun powers up, a theremin swoops up an octave, two vibraphone glints | 0.95 s |
| Mousetrap claim | `pickup-mousetrap` | A pine thunk, the spring creaking back, the bar's click and two sneaky upright-bass notes | 0.90 s |

Listening in the full game mix has not been checked yet.
