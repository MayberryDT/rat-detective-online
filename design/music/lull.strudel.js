// The lull (Tyler, 8 October): what the city plays while it breathes, between the chaos.
// Paste into https://strudel.cc and press play (ctrl+enter). Tweak, then use the Export tab
// (or record the tab). Once a take is chosen it goes in as public/music/lull.mp3 and the boogie
// crossfades into it during the lull (today the lull only drops the boogie to half volume).
// Built-in synths only, so no sample licences come with it. Strudel itself is AGPL: we ship
// the exported audio, never Strudel's code.
//
// Smoky after-hours trio at 72 bpm: brushed drums, a walking upright bass, a muted-horn line that
// barely says anything, and a little room hiss. Loops cleanly every 8 bars.

setcpm(72/4)

stack(
  // Brushes: a soft swish on every beat, a lazy swung ride, a rim click on 4.
  s("white*4").gain(.05).hpf(4000).lpf(9000).decay(.18).sustain(0).swingBy(1/3,4),
  s("<[~ white]*4>").gain(.035).hpf(7000).decay(.06).sustain(0).swingBy(1/3,4),
  s("~ ~ ~ white").gain(.06).bpf(2200).decay(.03).sustain(0),

  // Walking bass: C minor turnaround, Cm7 – Ab7 – Dm7b5 – G7, one note a beat.
  note(`<
    [c2 eb2 g2 bb2] [ab1 c2 eb2 gb2] [d2 f2 ab2 c3] [g1 b1 d2 f2]
    [c2 g1 bb1 b1]  [ab1 eb2 c2 a1]  [d2 ab1 f2 db2] [g1 d2 b1 g1]
  >`).s("triangle").lpf(380).attack(.005).decay(.35).sustain(.25).release(.15).gain(.55),

  // Chords on the piano, quiet, on the and-of-2 and 4 (the comp).
  note(`<
    [~ [~ [c3,eb3,g3,bb3]] ~ [~ [c3,eb3,g3,bb3]]]
    [~ [~ [ab2,c3,eb3,gb3]] ~ ~]
    [~ [~ [d3,f3,ab3,c4]] ~ [~ [d3,f3,ab3,c4]]]
    [~ [~ [g2,b2,d3,f3]] ~ ~]
  >`).s("sine").attack(.01).decay(.9).sustain(.1).release(.6).gain(.16).lpf(1800).room(.5).size(.8),

  // The horn: a muted, breathy line that only shows up every other phrase. Sawtooth through a
  // closed filter with slow vibrato reads as a smoky muted trumpet / sax, not a synth lead.
  note(`<
    ~ [g4@3 eb4] [f4@2 ~ ab4] [g4@4]
    ~ ~ [c5@2 bb4 g4] [ab4@3 ~]
  >`).s("sawtooth").lpf(sine.range(900,1500).slow(8)).lpq(4).vib(5).vibmod(.18)
     .attack(.12).decay(.4).sustain(.6).release(.5).gain(.13).room(.7).size(.9).delay(.25).delaytime(3/8).delayfeedback(.3),

  // Room tone: the faint hiss of a record playing in another apartment.
  s("pink").gain(.012).lpf(5000).hpf(400)
)
