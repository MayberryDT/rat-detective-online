"""Original deterministic cartoon foley for pickup claims, the case, armor reflection and the claim payoffs.
Standard library only; generates 48 kHz mono PCM WAVs. No borrowed case samples.
"""
import math, os, random, struct, wave
from pathlib import Path
RATE=48000
OUT=Path(__file__).resolve().parents[1]/'public/sounds/feedback'
TAU=2*math.pi

# ONLY=a,b renders just those (the rest are already on disk; every render is deterministic).
ONLY=set(filter(None,os.environ.get('ONLY','').split(',')))
def render(name,duration,fn,fade=0):
    if ONLY and name not in ONLY:return
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

def latch(t,g=1):
    # A brass latch snapping shut: a hard click, a short bright ring and a little spring chatter.
    if t<0:return 0
    ring=(math.sin(TAU*2150*t)*.5+math.sin(TAU*3370*t)*.3)*math.exp(-t*60)
    chatter=noise(MID,t)*.25*math.exp(-t*140)*(1+math.sin(TAU*95*t))
    return (click(t,noise(AIR,t))*1.2+ring+chatter)*g
def leather(t,g=1,pitch=1):
    # A palm on leather: a dark slap with a soft body thump under it.
    if t<0:return 0
    return (noise(DARK,t)*.9*math.exp(-t*60)+noise(MID,t)*.35*math.exp(-t*160)+thump(t,150*pitch,70*pitch,.07)*.8)*(1-math.exp(-t*2500))*g
def riffle(t,length=.28,g=1):
    # Papers riffling: a burst of fluttering air that thins out.
    if t<0 or t>length:return 0
    u=t/length
    return (noise(AIR,t)*.6+noise(MID,t)*.25)*math.sin(math.pi*u)**.7*(1+.6*math.sin(TAU*31*t))*(1-u)*g

def case_claim(t,n):
    # Yours: a weighty grab, both latches slam shut one after the other, a riffle of papers and a low thump that says got it.
    return leather(t,1.2)+latch(t-.07,1)+latch(t-.15,1.15)+riffle(t-.04,.3,.35)+thump(t-.15,95,48,.12)*.8

def case_dropped(t,n):
    # You lost it: the latches pop open, papers spill, and a muted trombone sags down a minor third.
    sag=bone(t-.18,146.8,.16)*.5+(trumpet(t-.36,174.6,146.8,.28,6)*.35 if t>=.36 else 0)
    return latch(t,.9)+latch(t-.05,.6)+riffle(t-.03,.45,.6)+leather(t-.02,.7,.8)+sag*.55

def case_snatched(t,n):
    # Someone else took it: a quick snatch and latch, under two low upright-bass notes, ominous.
    return leather(t,.8,1.1)+latch(t-.05,.7)+(bass(t-.1,73.4,.2)+bass(t-.26,69.3,.3))*.7

def case_loose(t,n):
    # Knocked loose: the case thuds down and its papers flutter.
    return leather(t,1,.8)+thump(t,120,55,.1)*.6+riffle(t-.02,.36,.45)+latch(t-.04,.35)

def case_thwack(t,n):
    # A ball smacks the case: a leather thwack, the latches jingle, a few sheets rustle.
    return leather(t,1,1.3)+latch(t-.02,.45)+latch(t-.07,.3)+riffle(t,.16,.25)

def case_knock(t,n):
    # A carrier's grip takes a hit: a hard knock and a latch rattling in the paw.
    return leather(t,.9,1.5)+latch(t-.015,.55)+latch(t-.055,.35)

# The arsenal (protocol 27): the Laser is a pulp ray gun firing molten cheese, the Tommy a racked bolt and a brass stab,
# the Mousetrap sneaky.
def ray(t,f0,f1,k,wobble=28,depth=2.6):
    # A ray-gun tone: a falling (or rising) pitch, frequency-modulated into a warbling, slightly square buzz.
    if t<0:return 0
    return math.tanh(2.2*math.sin(glide(t,f0,f1,k)+depth*math.sin(TAU*wobble*t)))
def bloop(t,f,d=.03,g=1):
    # A bubble bursting in melted cheese: a short sine whose pitch leaps up an octave and more as it pops.
    if t<0 or t>d*4:return 0
    return math.sin(glide(t,f,f*2.4,1/d))*(1-math.exp(-t*1500))*math.exp(-t/d)*g
def squelch(t,rate,d):
    # Wet goo: dark noise pumped by a slow pulse, like cheese pulled and slapped.
    return 0 if t<0 else noise(DARK,t)*(.5+.5*math.sin(TAU*rate*t))**2*math.exp(-t/d)
def laser_fire(t,n):
    # Wheee-GLORP: a 70 ms charge whine climbing, then the beam's "pew" diving from 2.2 kHz through a slow, deep, wet
    # wobble (a strand of molten cheese), a squelch under it, bubbles popping as it goes and a soft sub thump.
    whine=ray(t,700,2600,22,40,.4)*min(1,t/.05)*(1 if t<.07 else math.exp(-(t-.07)*90))*.4
    u=t-.06
    zap=0 if u<0 else ray(u,2200,140,6.5,14,4.2)*min(1,u/.004)*math.exp(-u*5)
    pops=sum(bloop(u-s,f,.03,g) for s,f,g in ((.09,420,.5),(.17,560,.4),(.26,350,.45),(.36,620,.3)))
    return whine+zap*.7+squelch(u,11,.18)*.5+pops+thump(u,110,40,.09)*.45
def laser_hit(t,n):
    # Splat and sizzle: a wet slap of cheese with a squelch and a few bubbles, then fat frying in a pan that spits and fades.
    splat=noise(DARK,t)*math.exp(-t*45)*1.1+noise(MID,t)*math.exp(-t*120)*.5+thump(t,170,55,.06)*.6
    spit=1 if (hash((int(t*600),7))%9)<2 else .25
    sizzle=(n*spit*.55+noise(AIR,t)*.3)*math.exp(-t*5)*min(1,t/.04)
    pops=sum(bloop(t-s,f,.025,g) for s,f,g in ((.05,700,.35),(.12,520,.3),(.21,880,.25)))
    return splat+squelch(t,16,.09)*.4+sizzle+pops
def claim_tommy(t,n):
    # The bolt racks back and slams home, the drum slaps on, then two short trombone hits a fourth up over a brush.
    bolt=latch(t,1.1)+latch(t-.09,1.3)+leather(t-.03,.9,.7)+thump(t-.09,140,60,.06)*.6
    stab=bone(t-.28,98,.06)*.8+bone(t-.28,146.8,.06)*.5+bone(t-.4,130.8,.22)+bone(t-.4,196,.22)*.6
    return bolt+brush(t-.2)*.4+stab*.55
def claim_laser(t,n):
    # The ray gun powers up (a rising whine wobbling like goo, bubbles popping), a theremin swoops up an octave, a
    # vibraphone glints on top.
    power=ray(t,180,1600,3.5,7,1.4)*math.sin(math.pi*min(1,t/.42))**2*.35+squelch(t,9,.3)*.12
    pops=sum(bloop(t-s,f,.035,g) for s,f,g in ((.08,300,.35),(.18,420,.3),(.27,520,.25)))
    theremin=0 if t<.3 else math.sin(glide(t-.3,440,880,9)+.12*math.sin(TAU*6*(t-.3)))*min(1,(t-.3)/.05)*math.exp(-(t-.3)*2.6)*.4
    return power+pops+theremin+vibes(t-.5,1318.5,.4)*.18+vibes(t-.56,1760,.35)*.14
def claim_mousetrap(t,n):
    # A pine thunk, the spring creaking as it is pulled back, the bar's click, then two sneaky upright-bass notes.
    creak=0 if t<.05 or t>.3 else math.tanh(3*math.sin(glide(t-.05,260,520,4)))*(1+math.sin(TAU*31*t))*.5*math.sin(math.pi*(t-.05)/.25)*.18
    return leather(t,1,.9)+creak+latch(t-.3,.9)+(bass(t-.38,61.7,.14)+bass(t-.52,58.3,.3))*.7

def claim_persuader(t,n):
    # The Persuader: the cylinder spun (a run of ratchet clicks slowing down), the hammer cocked, then a low bass note
    # under a muted trombone, like a door closing on the case.
    clicks=sum(latch(t-s,.55+.08*k) for k,s in enumerate((0,.034,.07,.11,.155,.207,.266)))*.55
    cock=latch(t-.36,1.5)+thump(t-.36,120,58,.05)*.5
    sting=bass(t-.5,55,.32)*.8+bone(t-.5,110,.3)*.45+bone(t-.5,164.8,.3)*.25
    return clicks+cock+sting

render('case-claim',.62,case_claim,.06)
render('case-dropped',.95,case_dropped,.08)
render('case-snatched',.62,case_snatched,.06)
render('case-loose',.46,case_loose,.05)
render('case-thwack',.3,case_thwack,.04)
render('case-knock',.24,case_knock,.03)
render('armor-clang',.34,lambda t,n:plate(t,1,.11),.03)
render('pickup-ironclad',.95,ironclad,.06)
render('pickup-slap',.22,slap)
render('pickup-hustle',.78,hustle,.05)
render('pickup-quick-fix',1,quick_fix,.08)
render('pickup-stakeout',.96,stakeout,.06)
render('stakeout-shutter',.08,shutter,.01)
render('pip-tick',.05,pip,.008)
render('laser-fire',.62,laser_fire,.08)
render('laser-hit',.5,laser_hit,.08)
render('pickup-tommy-gun',.85,claim_tommy,.06)
render('pickup-laser',.95,claim_laser,.08)
render('pickup-mousetrap',.9,claim_mousetrap,.08)
render('pickup-persuader',1,claim_persuader,.08)
