"""Incident assets: original procedural metal/saw and CC0 recorded cartoon pop.
Regenerate with python3 scripts/generate-incident-sounds.py from the project root.
Metal uses inharmonic struck modes; saw uses grinding tooth pulses.
Popcorn is converted from the included unfa recording using ffmpeg.
"""
import math, random, wave, struct
from pathlib import Path
RATE = 24000
OUT = Path(__file__).resolve().parents[1] / 'public/sounds/incidents'
OUT.mkdir(parents=True, exist_ok=True)
def render(name, duration, sample, seed):
    rng=random.Random(seed); values=[sample(i/RATE,rng) for i in range(round(duration*RATE))]
    # Remove DC, normalize with headroom, taper ends to avoid clicks.
    mean=sum(values)/len(values); values=[x-mean for x in values]
    peak=max(abs(x) for x in values) or 1
    values=[x/peak*.88*min(1,i/24,(len(values)-1-i)/120) for i,x in enumerate(values)]
    with wave.open(str(OUT / (name+'.wav')),'wb') as f:
        f.setparams((1,2,RATE,0,'NONE','not compressed'))
        f.writeframes(b''.join(struct.pack('<h',round(x*32767)) for x in values))
def metal(t,r):
    crack=r.uniform(-1,1)*math.exp(-t*100)*2.6
    clang=sum(math.sin(2*math.pi*f*t)*math.exp(-t*(12+j*5))/(1+j*.4) for j,f in enumerate([1373,2219,3541,4877]))
    # Comically failing spring after the initial metallic snap.
    u=max(0,t-.045); spring=math.sin(2*math.pi*(510*u-490*u*u)+2*math.sin(2*math.pi*38*u))*math.exp(-u*12) if t>.045 else 0
    chatter=sum(r.uniform(-1,1)*math.exp(-(t-d)*150)*.65 for d in [.065,.095,.135] if t>=d)
    return crack+clang*.42+spring*.65+chatter
render('malfunction',.42,metal,81)
# Popcorn uses recorded foley, not synthesis. Rebuild from the included CC0 source.
import subprocess
for variant in range(3):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-i', str(OUT.parents[2] / 'assets/audio/cartoon-pop-unfa.mp3'),
        '-ac', '1', '-ar', str(RATE), str(OUT / f'pop-{variant}.wav')], check=True)

def saw(t,r):
    # Integer-period modulation permits a seamless two-second loop.
    phase=2*math.pi*120*t+2.8*math.sin(2*math.pi*2*t)+.4*math.sin(2*math.pi*13*t)
    teeth=sum(math.sin(k*phase)/k**.7 for k in range(1,19))
    sputter=.65+.22*math.sin(2*math.pi*7*t)+.13*math.sin(2*math.pi*23*t)
    squeal=math.sin(2*math.pi*1800*t+5*math.sin(2*math.pi*3*t))*.19
    return math.tanh(teeth*1.8)*sputter+ r.uniform(-1,1)*.23+squeal
render('case-saw',2,saw,300)
print('Generated five original incident samples')
