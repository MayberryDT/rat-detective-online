"""Edit physical foley into short slapstick cues (requires ffmpeg, Python stdlib).

All audible layers are recordings, cut/resampled/filtered and overlapped here.
No musical notes, oscillators or generated pitch sweeps. Source/license details:
assets/audio/cartoon-foley/README.md. Accepted Popcorn assets are untouched.
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
    def __init__(self, name, duration):
        self.name = name
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
        with wave.open(str(OUT / f'{self.name}.wav'), 'wb') as out:
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

# The latch slips, the spring sags, and the case clatters away.
cue = Cue('case-lost', .76).latch(0, .65)
cue.spring(.025, 1, .62, rate=.72)
cue.add(.38, 'impactSoft_heavy_000', .35, .22, rate=.82, lowpass=1800)
for at, gain, rate in [(.45,.6,.92), (.54,.4,1.03), (.61,.25,.88)]:
    cue.add(at, 'impactTin_medium_001', gain, .13, rate=rate, highpass=400)
cue.save()

# A quieter snatch/latch, with no reward jingle for someone else's pickup.
Cue('case-taken', .31).add(0, 'impactSoft_heavy_000', .4, .1, reverse=True).latch(.025).latch(.115, .45).save()

# Two explicit sharp clinks, then small loose-metal chatter; no low body thump.
cue = Cue('case-hit', .34).latch(0, 1).latch(.085, .8, 1.13)
cue.add(.165, 'impactTin_medium_001', .22, .1, rate=1.2, highpass=1100, decay=15).save()

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
print('Rendered 10 edited physical cartoon foley cues')
