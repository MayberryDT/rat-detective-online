"""Original deterministic cartoon foley for pickup claims, armor reflection and the claim payoffs.
Standard library only; generates 48 kHz mono PCM WAVs. No borrowed case samples.
"""
import math, random, struct, wave
from pathlib import Path
RATE=48000
OUT=Path(__file__).resolve().parents[1]/'public/sounds/feedback'
TAU=2*math.pi

def render(name,duration,fn,fade=0):
    rng=random.Random(1701)
    samples=[fn(i/RATE,rng.uniform(-1,1)) for i in range(int(RATE*duration))]
    for i in range(int(RATE*fade)):samples[-1-i]*=.5-.5*math.cos(math.pi*i/(RATE*fade))
    peak=max(abs(v) for v in samples) or 1
    with wave.open(str(OUT/(name+'.wav')),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(RATE)
        out.writeframes(b''.join(struct.pack('<h',round(v/peak*.86*32767)) for v in samples))

def band(lo,hi,seed):
    # One second of looped noise between lo and hi Hz (two-pole sections), unit RMS.
    rng=random.Random(seed);xs=[rng.uniform(-1,1) for _ in range(RATE)]
    def low(xs,hz):
        a=1-math.exp(-TAU*hz/RATE)
        for _ in range(2):
            y=0;out=[]
            for x in xs:y+=a*(x-y);out.append(y)
            xs=out
        return xs
    ys=[a-b for a,b in zip(low(xs,hi),low(xs,lo))] if lo else low(xs,hi)
    rms=math.sqrt(sum(v*v for v in ys)/len(ys));return [v/rms for v in ys]
DARK,MID,AIR=band(0,650,11),band(600,3200,12),band(2600,9000,13)
def noise(buf,t):return buf[int(t*RATE)%RATE] if t>=0 else 0
def glide(t,f0,f1,k):
    # Phase of a pitch falling or rising from f0 toward f1 at rate k.
    return TAU*(f1*t+(f0-f1)*(1-math.exp(-k*t))/k)
def thump(t,f0,f1,d):
    return 0 if t<0 else math.sin(glide(t,f0,f1,30))*math.exp(-t/d)*(1-math.exp(-t*3000))

BODY=[(173,1,.06,.3),(229,.8,.05,1.9),(283,.7,.045,4.1),(347,.6,.04,.8),(409,.5,.035,2.6),(467,.4,.03,5.2),(557,.3,.025,1.4),(643,.2,.02,3.3),(781,.15,.012,.6),(947,.1,.01,2.2)]
def plate(t,heavy=1,ring=.13):
    # Heavy armour plate: a falling sub thump, a dense short cluster of low modes and one dark
    # anvil-bell ring; the contact is dark noise, not hiss, so it lands as weight rather than tin.
    if t<0:return 0
    body=sum(g*math.sin(TAU*f*t+p)*math.exp(-t/d) for f,g,d,p in BODY)
    bell=(math.sin(TAU*196*t)*.55+math.sin(TAU*311*t)*.4+math.sin(TAU*492*t)*.12*math.exp(-t*12))*math.exp(-t/ring)
    hit=noise(DARK,t)*.5*math.exp(-t*55)+noise(MID,t)*.3*math.exp(-t*350)
    return (thump(t,130,44,.1)*.75*heavy+body*.6+bell*.5+hit)*(1-math.exp(-t*5000))

def slap(t,n):
    return (n*.8+math.sin(2*math.pi*(180-100*t)*t))*(1-math.exp(-t*1900))*math.exp(-t*38)

def click(t,n):
    return 0 if t<0 else (n*.7+math.sin(2*math.pi*2900*t)*.5)*(1-math.exp(-t*5000))*math.exp(-t*520)

def horn(t,f,hold=.26,ph=0):
    # Muted brass: stacked harmonics that brighten as the swell peaks, then close.
    if t<0:return 0
    swell=min(1,t/.05)*math.exp(-t/hold)
    return swell*sum(math.sin(k*(TAU*f*t+ph))/k*math.exp(-k*(.9-.5*swell)) for k in range(1,9))
def bone(t,f,hold):
    # Low trombone section: two slightly detuned horns for a fuller, chorused body.
    return horn(t,f,hold)+horn(t,f*1.004,hold,1.3)*.8
def trumpet(t,f0,f1,hold,bend=18):
    # Harmon-muted trumpet: nasal formant near 1.5 kHz, optionally bending up from f0 to f1.
    if t<0:return 0
    swell=min(1,t/.03)*math.exp(-t/hold);ph=glide(t,f0,f1,bend)
    return swell*sum(math.sin(k*ph)*math.exp(-math.log(k*f1/1500)**2/.6)/k**.5 for k in range(1,10))
def bass(t,f,d=.35):
    # Upright bass pluck: upper harmonics die first, with a soft finger thud.
    if t<0:return 0
    return (sum(math.sin(TAU*f*k*t)/k**1.2*math.exp(-t*(1+.7*(k-1))/d) for k in range(1,7))+noise(DARK,t)*.25*math.exp(-t*90))*(1-math.exp(-t*900))
def vibes(t,f,d=.6):
    # Vibraphone bar: fundamental with the bar's 4x and 10x partials, soft mallet, motor tremolo.
    if t<0:return 0
    bar=math.sin(TAU*f*t)*math.exp(-t/d)+.22*math.sin(TAU*f*3.98*t)*math.exp(-t/.07)+.05*math.sin(TAU*f*9.9*t)*math.exp(-t/.015)
    return bar*(1-.28*(.5+.5*math.sin(TAU*5.5*t)))*(1-math.exp(-t*1200))
def brush(t,length=.14):
    # Snare brush: a swish that swells and closes, then a light tap with a little shell.
    if t<0:return 0
    swish=noise(AIR,t)*.5*math.sin(math.pi*min(1,t/length))**2 if t<length else 0
    tap=0 if t<length else (noise(MID,t)*.8+math.sin(TAU*190*t))*math.exp(-(t-length)*40)
    return swish+tap*.5

def ironclad(t,n):
    # The coat seats with a scrape, locks on with a heavy plate, then two low trombone hits
    # rising a fourth (D2+A2, G2+D3): settled, solid, nothing gets through.
    scrape=(noise(DARK,t)*.5+noise(MID,t)*.12)*math.sin(math.pi*min(1,t/.32))**2*.3
    sting=bone(t-.3,73.4,.07)*.7+bone(t-.3,110,.07)*.5+bone(t-.42,98,.3)+bone(t-.42,146.8,.3)*.6
    return plate(t,.45,.08)*.45+scrape+plate(t-.17,1.25,.2)+sting*.6

def hustle(t,n):
    # Engine rev blipping up into the existing rising whoosh, then a brush and an upright-bass
    # pickup run (E2 G2 Bb2) under a short muted-trumpet stab.
    rev=0
    if t<.36:
        ph=glide(t,38,175,7)
        rev=sum(math.sin(k*ph)/k*math.exp(-k*.22) for k in range(1,14))*(1+.45*math.sin(ph/2))
        rev*=min(1,t/.02)*math.sin(math.pi*min(1,t/.36))**.6*.5
    whoosh=(noise(MID,t)*.35+noise(AIR,t)*.2)*math.sin(math.pi*min(1,t/.36))**2+math.sin(TAU*(100+420*t)*t)*math.exp(-t*13)*.28
    sting=brush(t-.26)*.5+bass(t-.3,82.4,.12)+bass(t-.38,98,.12)+bass(t-.46,116.5,.25)*1.1+trumpet(t-.46,329.6,329.6,.11)*.3
    return rev*1.4+whoosh*.45+sting*.5

def heartbeat(t,strength):
    # Lub-dub: a soft low thump and a lighter second beat 120 ms later.
    if t<0:return 0
    return (thump(t,95,52,.07)+noise(DARK,t)*.2*math.exp(-t*60)*(1-math.exp(-t*400))+thump(t-.12,110,58,.05)*.65)*strength

def quick_fix(t,n):
    # Lid click, bandage sweep and rubber snap over a heartbeat that slows and softens,
    # resolving into a calm vibraphone Fmaj7 (F4 A4 C5 E5).
    kit=noise(MID,t)*.25*math.sin(math.pi*min(1,t/.4))**2*.6+slap(t,n)*.35+(slap(t-.24,n)*.45 if t>=.24 else 0)+math.sin(TAU*640*t)*math.exp(-t*28)*.12
    beat=heartbeat(t,1)+heartbeat(t-.3,.75)+heartbeat(t-.68,.4)
    sting=vibes(t-.34,349.2)+vibes(t-.43,440)+vibes(t-.52,523.3)+vibes(t-.61,659.3,.5)*.9
    return kit+beat*.55+sting*.2

def stakeout(t,n):
    # Lens ratchet into a firm click, a soft radar sweep rising across the frame, the low
    # minor-third brass, then a muted-trumpet "aha" bending up a fourth (D4 to G4, then C5).
    lens=sum(click(t-s,n)*.35 for s in (0,.022,.041,.058))+click(t-.09,n)
    sweep=0
    if .08<=t<.5:
        u=t-.08;env=math.sin(math.pi*u/.42)**2
        sweep=(math.sin(glide(u,420,1900,4))+math.sin(glide(u,424,1915,4)))*.5*env*.18+noise(AIR,t)*.04*env
    low=0 if t<.11 else (horn(t-.11,98)+horn(t-.11,116.5)*.8)*.55
    aha=trumpet(t-.4,293.7,392,.12,25)*.5+trumpet(t-.56,392,523.3,.22,40)*.6
    return lens+sweep+low+aha*.25

def shutter(t,n):
    # Dry leaf shutter: open and close clicks 32 ms apart over a tiny mechanism knock.
    def snap(t,g):return 0 if t<0 else (noise(AIR,t)*.6+noise(MID,t)*.5+math.sin(TAU*1850*t)*.6)*math.exp(-t*650)*g
    return snap(t,.8)+snap(t-.032,1)+noise(DARK,t)*.25*math.exp(-t*120)

def pip(t,n):
    # Small bright tick: a glassy two-partial ping with a crisp edge.
    return (math.sin(TAU*2350*t)+math.sin(TAU*5640*t)*.3*math.exp(-t*80)+noise(AIR,t)*.25*math.exp(-t*900))*math.exp(-t*95)*(1-math.exp(-t*8000))

render('armor-clang',.34,lambda t,n:plate(t,1,.11),.03)
render('pickup-ironclad',.95,ironclad,.06)
render('pickup-slap',.22,slap)
render('pickup-hustle',.78,hustle,.05)
render('pickup-quick-fix',1,quick_fix,.08)
render('pickup-stakeout',.96,stakeout,.06)
render('stakeout-shutter',.08,shutter,.01)
render('pip-tick',.05,pip,.008)
