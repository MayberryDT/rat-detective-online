"""Original deterministic cartoon foley for pickup claims and armor reflection.
Standard library only; generates 48 kHz mono PCM WAVs. No borrowed case samples.
"""
import math, random, struct, wave
from pathlib import Path
RATE=48000
OUT=Path(__file__).resolve().parents[1]/'public/sounds/feedback'

def render(name,duration,fn):
    rng=random.Random(1701)
    samples=[fn(i/RATE,rng.uniform(-1,1)) for i in range(int(RATE*duration))]
    peak=max(abs(v) for v in samples) or 1
    with wave.open(str(OUT/(name+'.wav')),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(RATE)
        out.writeframes(b''.join(struct.pack('<h',round(v/peak*.86*32767)) for v in samples))

def metal(t,n):
    # Heavy low plate, inharmonic ringing and a short contact crack.
    modes=sum(g*math.sin(2*math.pi*f*t)*math.exp(-t/d) for f,g,d in
              [(148,1,.19),(243,.55,.13),(421,.28,.1),(739,.15,.06)])
    return modes*(1-math.exp(-t*2400))+n*.75*math.exp(-t*95)

def armor(t,n):
    # Two pieces seating, with a rising scrape between them.
    return metal(t,n)*.7+(metal(t-.17,n)*.95 if t>=.17 else 0)+n*.13*math.sin(math.pi*min(1,t/.32))**2

def slap(t,n):
    return (n*.8+math.sin(2*math.pi*(180-100*t)*t))*(1-math.exp(-t*1900))*math.exp(-t*38)

def speed(t,n):
    return n*math.sin(math.pi*min(1,t/.36))**2*.75+math.sin(2*math.pi*(100+420*t)*t)*math.exp(-t*13)*.28

def heal(t,n):
    # Lid click, soft bandage sweep and a clean rubber snap; no alarm/red-cross cue.
    return n*.25*math.sin(math.pi*min(1,t/.4))**2+slap(t,n)*.35+(slap(t-.24,n)*.45 if t>=.24 else 0)+math.sin(2*math.pi*640*t)*math.exp(-t*28)*.12

def click(t,n):
    return 0 if t<0 else (n*.7+math.sin(2*math.pi*2900*t)*.5)*(1-math.exp(-t*5000))*math.exp(-t*520)

def horn(t,f):
    # Muted brass: stacked harmonics that brighten as the swell peaks, then close.
    swell=min(1,t/.05)*math.exp(-t/.26)
    return swell*sum(math.sin(2*math.pi*f*k*t)/k*math.exp(-k*(.9-.5*swell)) for k in range(1,9))

def stakeout(t,n):
    # Lens focus: a ring ratchet of small ticks into a firm click, then a low minor-third brass sting.
    lens=sum(click(t-s,n)*.35 for s in (0,.022,.041,.058))+click(t-.09,n)
    return lens+(0 if t<.11 else (horn(t-.11,98)+horn(t-.11,116.5)*.8)*.55)

render('armor-clang',.55,metal)
render('pickup-ironclad',.62,armor)
render('pickup-slap',.22,slap)
render('pickup-hustle',.36,speed)
render('pickup-quick-fix',.46,heal)
render('pickup-stakeout',.62,stakeout)
