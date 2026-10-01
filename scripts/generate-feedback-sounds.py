"""Edit physical foley into short slapstick cues (requires ffmpeg, Python stdlib).

All audible layers are recordings, cut/resampled/filtered and overlapped here.
No musical notes, oscillators or generated pitch sweeps. Source/license details:
assets/audio/cartoon-foley/README.md and assets/audio/README.md (the Thompson
recording). Accepted Popcorn assets are untouched.
"""
from pathlib import Path
import array
import math
import struct
import subprocess
import wave

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/audio/cartoon-foley'
OUT = ROOT / 'public/sounds/feedback'
RATE = 24000
CACHE = {}


def recording(name):
    if name not in CACHE:
        path = SOURCE / (name + ('.mp3' if name == 'door-stopper-xenosns' else '.ogg'))
        raw = subprocess.check_output([
            'ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-',
        ])
        samples = array.array('f', raw)
        CACHE[name] = samples
    return CACHE[name]


def clip(name, length, rate=1, start=0, highpass=60, lowpass=10000, reverse=False, decay=0):
    source = recording(name)
    source = source[round(start*RATE):round((start+length*rate)*RATE)]
    if reverse:
        source = source[::-1]
    if not source:
        raise ValueError(f'Empty cut: {name}')
    # Decode to float first: compressed recording peaks may exceed 1.0.
    peak = max(map(abs, source)) or 1
    samples = []
    previous = high = low = 0
    hp = math.exp(-2*math.pi*highpass/RATE)
    lp = 1-math.exp(-2*math.pi*lowpass/RATE)
    for i in range(min(round(length*RATE), int((len(source)-1)/rate))):
        position = i*rate
        index = int(position)
        v = (source[index]*(1-position+index) + source[index+1]*(position-index))/peak
        high = hp*(high+v-previous)
        previous = v
        low += lp*(high-low)
        samples.append(low*math.exp(-i/RATE*decay))
    return samples


class Cue:
    def __init__(self, name, duration, out=OUT):
        self.name = name
        self.out = out
        self.samples = [0.0]*round(duration*RATE)

    def add(self, at, name, gain, length, **options):
        values = clip(name, length, **options)
        offset = round(at*RATE)
        for i, v in enumerate(values):
            if offset+i >= len(self.samples):
                break
            # Sub-millisecond attack retains the clink; short fade avoids hard cuts.
            envelope = min(1, i/12, (len(values)-1-i)/288)
            self.samples[offset+i] += v*gain*envelope
        return self

    def spring(self, at, gain, length, rate=1, start=2.744):
        return self.add(at, 'door-stopper-xenosns', gain, length, rate=rate, start=start,
                        highpass=100, lowpass=6500, decay=1.5)

    def latch(self, at, gain=1, rate=1):
        self.add(at, 'impactMetal_light_001', gain*.75, .16, rate=rate, highpass=650, decay=9)
        self.add(at+.012, 'impactPlate_light_002', gain*.35, .25, rate=rate*1.2, highpass=900, decay=12)
        return self

    def save(self):
        # Consistent headroom; all processing happens offline, never in gameplay.
        peak = max(map(abs, self.samples)) or 1
        scale = .86/peak
        pcm = [round(v*scale*min(1, i/12, (len(self.samples)-1-i)/288)*32767)
               for i, v in enumerate(self.samples)]
        with wave.open(str(self.out / f'{self.name}.wav'), 'wb') as out:
            out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            out.writeframes(struct.pack('<'+'h'*len(pcm), *pcm))


OUT.mkdir(parents=True, exist_ok=True)
# A solid snatch, wound spring and emphatic double latch: "this thing matters."
cue = Cue('case-pickup', .70)
cue.add(0, 'impactWood_heavy_000', .6, .14, lowpass=3500)
cue.spring(.018, .55, .34, rate=1.15)
for at, gain in [(.13, .2), (.20, .3), (.25, .4)]:
    cue.add(at, 'impactMetal_medium_002', gain, .06, highpass=700)
cue.latch(.30, 1).latch(.395, .65, 1.08).save()

# A quieter snatch/latch, with no reward jingle for someone else's pickup.
Cue('case-taken', .31).add(0, 'impactSoft_heavy_000', .4, .1, reverse=True).latch(.025).latch(.115, .45).save()

# Slapstick desk props: pop-up snaps into place; closing scrapes and clacks shut.
cue = Cue('menu-open', .27)
cue.add(0, 'impactSoft_heavy_000', .35, .085, reverse=True, highpass=350)
cue.add(.035, 'impactWood_light_001', .9, .09, rate=1.25, highpass=200)
cue.spring(.05, .35, .20, rate=1.35).save()
cue = Cue('menu-close', .22)
cue.add(0, 'impactSoft_heavy_000', .45, .12, reverse=True, highpass=450)
cue.add(.085, 'impactWood_heavy_000', 1, .10, rate=1.1, highpass=120)
cue.add(.135, 'impactMetal_medium_002', .15, .07, highpass=1200).save()

# A broad WHACK and loose spring under the existing rat death voice.
cue = Cue('death', .66)
cue.add(0, 'impactPunch_heavy_001', .85, .23, rate=.85, lowpass=4500)
cue.add(.012, 'impactWood_heavy_000', .45, .13, rate=.8, lowpass=3000)
cue.spring(.05, .8, .55, rate=.8, start=8.155)
cue.add(.36, 'impactTin_medium_001', .35, .17, rate=.78).save()

# Springing back to work: a quick spring kick followed by a dry upright snap.
cue = Cue('respawn', .45).spring(0, .85, .35, rate=1.3, start=8.155)
cue.add(.20, 'impactWood_light_001', .7, .12, rate=1.1)
cue.latch(.235, .4).save()

# The Dispatch machinery winds, stamps and shakes its loose hardware.
cue = Cue('dispatch', .5).spring(0, .55, .24, rate=1.1)
for at, gain in [(.02,.3), (.075,.4), (.12,.5)]:
    cue.add(at, 'impactMetal_medium_002', gain, .07, highpass=650)
cue.add(.18, 'impactWood_heavy_000', 1, .18, rate=.85)
cue.add(.23, 'impactTin_medium_001', .7, .17, rate=.9)
cue.latch(.3, .3).save()
Cue('tick', .055).add(0, 'impactWood_light_001', .7, .05, rate=1.4, highpass=700, decay=35).save()

# The Mousetrap (protocol 27). Set down: a pine thunk, the bar latching and a little creak of the spring.
cue = Cue('trap-set', .34)
cue.add(0, 'impactWood_heavy_000', 1, .2, rate=.9, lowpass=3200)
cue.add(.045, 'impactMetal_light_001', .45, .1, rate=1.1, highpass=900, decay=14)
cue.spring(.07, .22, .16, rate=1.7).save()
# SNAP: a sharp crack of the bar on the base, the steel slapping home, a body thump and the big spring twang.
cue = Cue('trap-snap', .68)
cue.add(0, 'impactWood_light_001', 1, .1, rate=1.35, highpass=350)
cue.add(0, 'impactMetal_medium_002', .7, .12, rate=1.1, highpass=500)
cue.add(.004, 'impactPunch_heavy_001', .55, .16, rate=1.2, lowpass=3000)
cue.spring(.025, .9, .6, rate=1.05).save()
# A ball chips the base: one small dry splinter.
Cue('trap-splinter', .1).add(0, 'impactWood_light_001', .9, .08, rate=1.7, highpass=1400, decay=30).save()
# Broken: the base crunches apart, splinters fly, and the freed spring sags out a slow sad boing.
cue = Cue('trap-break', .95)
cue.add(0, 'impactWood_heavy_000', 1, .22, rate=.75, lowpass=4000)
for at, rate in [(.03, 1.25), (.075, 1.45), (.12, 1.1)]:
    cue.add(at, 'impactWood_light_001', .45, .08, rate=rate, highpass=900)
cue.spring(.13, .75, .8, rate=.55, start=8.155).save()
# Refused (no room to set it): a dull wooden clack.
cue = Cue('trap-refused', .2)
cue.add(0, 'impactWood_heavy_000', 1, .16, rate=.7, lowpass=900, decay=18)
cue.add(.01, 'impactSoft_heavy_000', .35, .1, lowpass=1200).save()
# Ready (the lockout after taking a trap is over): the spring winds tight and the bar locks back, ka-CHUNK.
cue = Cue('trap-ready', .36)
cue.spring(0, .45, .14, rate=1.45)
cue.latch(.11, 1, 1.1)
cue.add(.12, 'impactWood_heavy_000', .8, .14, rate=1.05, lowpass=3000).save()

# The Tommy Gun: each round is the ordinary cheese gun's shot (`public/sounds/gunshot.mp3`), pitched up a touch, laid
# over a recorded Thompson round, low-passed and quieter, both aligned on the transient (Tyler: the bare Thompson was
# "just too realistic"; this sits between it and the cheese gun). The Thompson rounds are cut from the CC0 burst
# recording at its full 48 kHz; each is a burst's last round (no next round for at least 0.2 s), so its room tail is
# its own. The game rotates them, ten a second, into the rattle.
WEAPONS = ROOT / 'public/sounds/weapons'
WEAPONS.mkdir(parents=True, exist_ok=True)
FULL = 48000
# The cheese gun's transient (first sample over a tenth of its peak), its pitch, and the Thompson's cutoff and level.
CHEESE_ONSET, CHEESE_RATE, THOMPSON_CUTOFF, THOMPSON_GAIN = .0323, 1.08, 3500, .5


def decode(path):
    return array.array('f', subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(FULL), '-f', 'f32le', '-']))


def lowpass(samples, cutoff, q=.7071):
    # A Butterworth biquad (RBJ cookbook): takes the crack off the top without dulling the thump.
    w = 2*math.pi*cutoff/FULL
    alpha, cos = math.sin(w)/(2*q), math.cos(w)
    a0 = 1+alpha
    b0, b1, a1, a2 = (1-cos)/2/a0, (1-cos)/a0, -2*cos/a0, (1-alpha)/a0
    out, x1, x2, y1, y2 = [], 0., 0., 0., 0.
    for v in samples:
        y = b0*v+b1*x1+b0*x2-a1*y1-a2*y2
        x2, x1, y2, y1 = x1, v, y1, y
        out.append(y)
    return out


thompson = decode(ROOT / 'assets/audio/tommy-gun-craigsmith.mp3')
cheese = decode(ROOT / 'public/sounds/gunshot.mp3')
cheese_peak = max(map(abs, cheese)) or 1
for index, (onset, seconds) in enumerate([(1.114, .195), (3.093, .26), (4.243, .2), (5.648, .26)]):
    start, length = round((onset-.004)*FULL), round(seconds*FULL)
    cut = lowpass(thompson[start:start+length], THOMPSON_CUTOFF)
    peak = max(map(abs, cut)) or 1
    mix = []
    for i, v in enumerate(cut):
        # Both layers start 4 ms before their transient; the cheese shot is resampled (linear) to its pitch.
        position = (CHEESE_ONSET-.004)*FULL+i*CHEESE_RATE
        j = int(position)
        layer = (cheese[j]*(1-position+j)+cheese[j+1]*(position-j))/cheese_peak if j+1 < len(cheese) else 0
        mix.append(layer+THOMPSON_GAIN*v/peak)
    peak = max(map(abs, mix)) or 1
    # 0.2 ms in, the recording's own decay, then a 50 ms close.
    pcm = [round(v/peak*.86*min(1, i/10, (length-1-i)/(.05*FULL))*32767) for i, v in enumerate(mix)]
    with wave.open(str(WEAPONS / f'tommy-{index}.wav'), 'wb') as out:
        out.setparams((1, 2, FULL, 0, 'NONE', 'not compressed'))
        out.writeframes(struct.pack('<'+'h'*len(pcm), *pcm))
print('Rendered 16 edited physical cartoon foley cues and 4 cheese-gun Thompson rounds')
