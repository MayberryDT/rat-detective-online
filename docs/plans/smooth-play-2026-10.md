# Plan: fast entry, no freezes, true replays (October 2026)

Approved by Tyler on 8 October 2026 ("do it"). It follows the read-only scoping the same day; the evidence is on Halla under `/home/halla/build/rat-detective/scope-{entry,freeze,replay}-20261008/`.

**Status (8 October, evening; [receipt](../verification/smooth-play-2026-10-08.md)):** staging `6537a3d`, protocol 39.
- **Entry:** E1–E3 are done, and all `verify-entry` checks pass on Halla. A cold room clicked after load plays in 2.8–3.1 s (baseline 5.2 s). The main cause was server-side: every wake read all 891k stored city events, and a held seat did not tick. E4, the client load in Brave on your laptop, is next.
- **Replays:** R1–R3 are done. R4 is done for loops, which now rebuild nothing, and for fullscreen and save, which restart the clip in place. The server-clock fix stops clips whose rats never moved. Still open: building a clip before it plays, and the 110–160 ms GPU-bound frames in sent-flying clips (needs the laptop). R5 is unchanged.
- **Freezes:** F1 reporting is on staging, unverified; it waits for your staging session. F2 and F3 have not started.

**Goal:** you click Enter and you're playing within a few seconds; play never stops; replays show what the rat's player saw.

Ground rules for all three:
- Work goes on a new branch from `main` (`628e929`) on Halla, with builds and tests on Halla.
- Each part ships to staging when its checks pass. Production waits for your go-ahead. A production release would also carry the P4 papers and prints, since staging is ahead.
- Every part keeps the existing promises:
  - rooms only run with a human seat (no always-on city);
  - bots stay equal participants;
  - the lossless chaos wire;
  - packed-storage ancestry `2476135`;
  - weapons and aim;
  - no mode timers.
- For each part, the ways it could fail are written into its end-to-end check before any code. Each check leaves a repeatable artifact (JSON plus a recording or trace) under `/home/halla/build/rat-detective/smooth-play-202610/`.
- Measurements that matter are taken on **your laptop (Veelox, Brave)**, the machine where the problems happen, not only on Halla's slower test GPU. I'll ask before running anything scripted in your browser.

---

## 1. Entry: click to playing in a few seconds

**Today:** 9.6–11 s from a click on a cold room, of which:
- about 2–3 s is the room waking, done only after your browser finishes loading;
- about 6–7 s is the browser loading (measured on Halla, probably less on your laptop);
- about 1–1.5 s is after the welcome, before the first frame.

### Steps

**E1. Wake the room at the click.**
- The title screen already holds a prepared socket.
- When you press Enter, the client sends a join intent over it at once.
- The server starts the wake (checkpoint, bots, simulation) in parallel with the browser's loading. It holds the welcome until the client says it's ready, or sends it early and the client keeps it.
- The seat counts as "admitted and joining", which the human-seat rule already allows. If the tab closes, the seat expires through the existing grace.
- Expected gain: about 2–3 s.

**E2. A cheaper wake on the server.**
- Build the city's box list (`grayboxBoxes`) once per world and reuse it; today it is rebuilt several times per wake.
- Precompute supply and spawn points per layout at build time instead of at every wake (`seedPickups` takes about 0.2 s in Node and about 3× that on Workers).
- Build the bot controller's and the paper system's navigation once per isolate, then reuse it.
- Move the city recorder's and roster's setup into the prepare step, in memory only: no tick and no storage writes.
- Expected gain: about 0.5–1.5 s on a cold wake.

**E3. Keep the title's preparation alive.**
- The client re-prepares about every 20 s while the title is open, before today's 25 s and 30 s drops.
- Someone who waits on the title still gets a prepared room. Nothing ticks.

**E4. Shorter browser load and first frame.**
- Profile the load on your laptop, then cut the largest blocks:
  - the city build, 1.5 s on Halla;
  - shader warm-up;
  - waits on the graphics card;
  - supply props, 255 ms after the welcome;
  - the 2–3 long first frames.
- Candidates:
  - build supply props and pooled rats before the welcome;
  - split the city build across frames;
  - lower the 2.5 s shader-check cap where programs are already linked.
- Only cuts the profile supports.

### Check (written first)
**`scripts/verify-entry.mjs`** measures click → welcome → first playable frame, for a cold room and a warm room, clicking at once and clicking after waiting on the title. It records each phase, writes `entry-<build>.json`, and runs against the previous build for comparison.

Failure modes:
- a cold entry slower than the target;
- a seat left behind by an abandoned join;
- a room ticking with no human;
- bots spawned before a human seat exists;
- a join intent lost on a reconnect;
- a welcome arriving before the client can use it.

**Targets:**
- cold room, click at once: **4 s or less** on your laptop;
- warm room: **2 s or less**;
- an empty room still sleeps with no tick and no bots.

**Effort:** about 2 days.

---

## 2. Freezes: play never stops

**Today:**
- The game's own performance reports show stalls of 1.7–8.7 s, only on your laptop's Brave. A server or network fault would have frozen everyone, and nobody else stalled.
- The laptop runs short of memory: 4.4 GB pushed to swap, memory-pressure stalls, and NVIDIA out-of-memory errors.
- Separately, a dropped connection really does freeze the game today: other rats stop for up to 5 s, your held keys are cleared, the picture blanks for up to 2.5 s after rejoining, and a dead connection can take 60 s to notice.

The game has to behave well on that machine. The plan has three tracks: find exactly what stalls, make the game lighter so the stalls don't happen, and make it ride out any stall or drop without freezing.

### F1. Find it (first, about half a day)
- **For any frame over 1 s,** the performance report records:
  - the browser's attribution of what ran (long-animation-frame timing: which script, or rendering);
  - whether server messages kept arriving during it, which shows whether the page was alive;
  - whether the tab was visible and focused;
  - the connection state;
  - shader count, JS heap and estimated GPU memory, before and after.
- **Every report also carries memory over time,** so a slow leak shows up.
- **Merge the 7 October connection diagnostics** (close codes, reconnect counts).
- **Then you play one normal session on staging,** and we read what stalled.

### F2. Make it lighter (about 1–2 days, guided by F1)
- **Memory budget.**
  - Measure the JS heap and GPU memory a round uses on your laptop.
  - Set budgets for texture sizes, shadow maps, render targets, the city bake cache, effect pools, replay copies and audio buffers.
  - Cut the largest items that don't affect the look: for example, smaller textures where they never fill the screen, and freeing the replay stage and title scene when they're not shown.
- **No leaks.**
  - A 20-minute scripted soak must end with a flat heap and flat GPU memory: no growth per round or per reconnect.
  - Anything that grows gets fixed. Every welcome rebuilds the view, and replays build extra rats, so both are prime suspects.
- **Fewer main-thread spikes.**
  - The 7 October profile showed about 300 draw calls, with 10% of busy time spent updating matrices of things that never move.
  - Freeze static objects' matrices and merge static draws.
  - Remove frames over 50 ms in normal play: pooled effects instead of new objects mid-fight, no mid-play shader compiles or texture uploads, and no synchronous GPU reads during play.
- **Less garbage per frame,** so the collector doesn't pause play: reuse vectors and arrays on the hot paths that allocate today.

### F3. Ride it out (about 1 day; useful whatever the cause)
- **Your rat never stops on a network hiccup.**
  - Keep simulating your rat locally and keep held keys through a reconnect.
  - Keep drawing other rats along their last motion briefly instead of freezing them.
  - Draw stand-ins rather than a blank screen after rejoining.
- **A dead connection is found in about 10 s, not 60:** check every 5 s and reconnect after 10 s of silence. The 30 s reconnect grace keeps your rat, stats and case.
- **After a long frame, catch up smoothly.** Cap the catch-up so one hitch doesn't become a burst of jerky motion, and don't drop inputs pressed during it.
- **The server's worst ticks come down** (the paper system's step is the largest new cost), so they never add to a client hitch.

### Check (written first)
1. **A 20-minute soak on staging in Brave on your laptop,** run with your OK, with scripted movement, jumping and firing like the paper review recordings.
   - Targets: no frame over 1 s; 99th-percentile frame under 50 ms; heap and GPU memory flat after the first round; no reconnects.
2. **The same soak in a memory-squeezed run.** The browser is given less memory or a background process holds memory. It must degrade gently, with no frames over 1 s.
3. **A forced disconnect mid-run:**
   - your rat keeps moving;
   - the picture never blanks;
   - the reconnect lands within 10 s of the drop;
   - keys held during it still work.
4. **Your normal play on staging** for one session, read through the F1 reports.

Failure modes:
- a frame over 1 s;
- memory that grows round to round;
- a reconnect that freezes your rat;
- a dead connection undetected for more than 10 s;
- a catch-up that jerks;
- lost inputs.

**Effort:** about 3–4 days, depending on what F1 shows.

---

## 3. Replays: what the player saw

**Today:**
- The server knows where every rat was looking, bots included, but never sends it to the other players. Replays guess the view from shots and body facing, so the camera swings.
- Shots and deaths are stamped with the arrival time while movement uses the server's time, so rats freeze before falling.
- Each clip freezes the page about 0.4 s when it starts, loops forever and rebuilds every rat on each loop, and plays in slow motion around the moment.
- Server pauses show up as stalls.

### Steps

**R1. Send the look.**
- Each rat's look (yaw and pitch) goes in the movement broadcast. The server already receives it from every human and bot.
- About 2.5 KB/s more traffic per player. Protocol 38.

**R2. One clock.**
- Every event arriving with a frame (shot, hit, death, respawn) is stamped with the server time of the latest frame received.
- The socket keeps order, so events line up with movement to within about 33 ms. Client only.

**R3. Play it 1:1 through the real camera.**
- The replay drives the actual gameplay shoulder camera from the rat's recorded position and recorded look, smoothed the same way live play smooths other rats.
- No guessing from shots, no easing toward a guess, no slow motion.
- It is the same camera, at the same distance and height, with the same wall pull-in. Screen shake and the HUD stay out, as today.

**R4. Smooth playback.**
- Build the replay's rats and effects while the results board is coming up, not at the clip's start.
- A loop restarts the clip's clock without rebuilding anything.
- Fill brief server gaps the way live play does, by smoothing over the playback buffer, so they don't show as stalls.

**R5. Your own moments stay as they are:** they use your own camera track, which the client already records at 30 Hz.

### Check (written first)
**`scripts/verify-replay.mjs`** plays a real round on staging with agent seats and saves the live camera path of the featured rat as each client rendered it. It then plays the same clip from the replay and compares them.
- Targets:
  - camera position within 0.5 units of the live camera;
  - look direction within 5° for 95% of frames;
  - no frame over 100 ms during playback, at clip start or on a loop;
  - deaths land on the frame the victim stops, within 50 ms.
- It writes `replay-<build>.json` plus side-by-side video of the live view and the replay.

Failure modes:
- a camera that leaves the live path;
- a rat frozen before its death;
- a playback freeze at start or on a loop;
- slow motion still present;
- a bot clip with no look track.

**Effort:** about 1.5–2 days.

---

## Order and delivery

| Order | Part | Effort | Ships to staging when |
|---|---|---|---|
| 1 | Entry (E1–E4) | about 2 days | `verify-entry` meets the targets on your laptop |
| 2 | Freezes, find (F1) | about half a day | the reports run on staging; you play one session |
| 3 | Replays (R1–R5) | about 1.5–2 days | `verify-replay` meets the targets |
| 4 | Freezes, fix (F2, F3) | about 3–4 days | the soak passes on your laptop |

F1 goes early so your normal play produces evidence while the replay work proceeds. Each part gets a receipt in `docs/verification/` and a short report with the numbers before and after. At the end, a production release is a separate decision for you, with a before-and-after era comparison as usual.

## What I need from you

- **Approval of this plan,** and of protocol 38 on staging.
- **Permission to run scripted play in Brave on your laptop** for the entry timings and the freeze soak, only while you're not using it.
- **One normal play session on staging** after F1 ships.
