"""Deterministic cartoon foley bank. Python stdlib + ffmpeg; no online service.

Edits retained CC0 impact, spring and classic jump sources. Original offline
synthesis supplies a dry countdown pulse and a brief muted noir-jazz result
phrase. No ambient beds. See the output README.
"""
from pathlib import Path
import array, hashlib, json, math, random, re, struct, subprocess, wave

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/sounds/chaos'
RATE = 24000
SOURCES = ROOT / 'assets/audio/cartoon-foley'
CACHE = {}
ALIASES = dict(soft='impactSoft_heavy_000', punch='impactPunch_heavy_001', wood='impactWood_light_001',
              heavy='impactWood_heavy_000', metal='impactMetal_light_001',
              gear='impactMetal_medium_002', spring='door-stopper-xenosns', hop='jump-cabled-mess')
MP3_SOURCES={'spring','hop'}

def recording(name):
    if name not in CACHE:
        full = ALIASES[name]
        data = subprocess.check_output(['ffmpeg','-v','error','-i',str(SOURCES/(full+('.mp3' if name in MP3_SOURCES else '.ogg'))),
                                        '-ac','1','-ar',str(RATE),'-f','f32le','-'])
        CACHE[name] = array.array('f',data)
    return CACHE[name]

class Sound:
    def __init__(self, name, duration=.45):
        self.name=name; self.values=[0.0]*round(duration*RATE)
    def add(self, name, at=0, gain=1, length=.16, rate=1, start=None, reverse=False, lowpass=8000):
        raw=recording(name); start=(2.744 if name=='spring' else 0) if start is None else start
        raw=raw[round(start*RATE):round((start+length*rate+.005)*RATE)]
        if reverse: raw=raw[::-1]
        if len(raw)<2: raise ValueError((self.name,name,'empty source'))
        peak=max(map(abs,raw)) or 1; low=0; alpha=1-math.exp(-2*math.pi*lowpass/RATE)
        count=min(round(length*RATE),int((len(raw)-1)/rate))
        for i in range(count):
            pos=i*rate; j=int(pos); value=(raw[j]*(1-pos+j)+raw[j+1]*(pos-j))/peak
            low+=alpha*(value-low)
            k=round(at*RATE)+i
            if k>=len(self.values): break
            self.values[k]+=low*gain*min(1,i/24,(count-1-i)/240)
        return self
    def gesture(self, duration, sample, at=0, gain=1):
        """Render one designed gesture offline with deterministic noise and soft edges."""
        rng=random.Random(int.from_bytes(hashlib.sha256((self.name+str(at)).encode()).digest()[:8],'big'))
        for i in range(round(duration*RATE)):
            k=round(at*RATE)+i
            if k>=len(self.values):break
            t=i/RATE
            self.values[k]+=sample(t,rng)*gain*min(1,t/.006,(duration-t)/.025)
        return self
    def muted_horn(self, note, at, length, gain=1, bend=0):
        """Soft, breathy low-register mute; a late small fall supplies the comic wink."""
        freq=440*2**((note-69)/12); phase=0; air=0
        def sample(t,rng):
            nonlocal phase,air
            fall=min(1,max(0,(t/length-.60)/.32))
            vibrato=.09*math.sin(2*math.pi*5.2*t)*min(1,t/.2)
            phase+=2*math.pi*freq*2**((-.55*math.exp(-t*35)+bend*fall+vibrato)/12)/RATE
            air+=.12*(rng.uniform(-1,1)-air)
            # Gentle harmonics instead of the preceding fanfare's bright saturation.
            value=(math.sin(phase)+.40*math.sin(2*phase)+.16*math.sin(3*phase)+.045*math.sin(4*phase))
            envelope=min(1,t/.035)*min(1,(length-t)/.13)*(.88+.12*math.exp(-t*9))
            return (value+.06*air)*envelope
        return self.gesture(length,sample,at,gain)
    def bass(self, note, at, length, gain=1):
        """Damped low string body: no metallic or bell partials."""
        freq=440*2**((note-69)/12)
        def sample(t,rng):
            phase=2*math.pi*freq*t
            value=math.sin(phase)+.32*math.sin(2*phase)*math.exp(-t*7)+.12*math.sin(3*phase)*math.exp(-t*15)
            return value*math.exp(-t*6)*min(1,(length-t)/.09)
        return self.gesture(length,sample,at,gain)
    def brush(self, at, length, gain=1):
        low=0
        def sample(t,rng):
            nonlocal low
            low+=.10*(rng.uniform(-1,1)-low)
            return low*math.exp(-t*9)
        return self.gesture(length,sample,at,gain)
    def save(self):
        peak=max(map(abs,self.values))
        if peak<1e-5: raise ValueError(self.name+' is silent')
        # Consistent source headroom. Runtime gains, not PCM normalization, set the mix.
        samples=[round(v*.82/peak*min(1,i/24,(len(self.values)-1-i)/240)*32767) for i,v in enumerate(self.values)]
        with wave.open(str(OUT/(self.name+'.wav')),'wb') as f:
            f.setparams((1,2,RATE,0,'NONE','not compressed')); f.writeframes(struct.pack('<'+'h'*len(samples),*samples))
        return {'file':self.name+'.wav','seconds':len(samples)/RATE,'peak':max(map(abs,samples))/32768,
                'rms':math.sqrt(sum((x/32768)**2 for x in samples)/len(samples))}

def make(name):
    # One recognizable gesture per event; no generic background rattle layers.
    if name=='jump': return Sound(name,.24).add('hop',length=.235,rate=1.04,lowpass=4500)
    if name=='land-heavy': return Sound(name,.22).add('punch',length=.16,rate=.7).add('soft',.025,.4,.15,.8)
    if name=='wall-bonk': return Sound(name,.24).add('punch',length=.20,rate=.65,lowpass=1050).add('soft',.018,.75,.20,.7,lowpass=650)
    if name=='corpse-bounce': return Sound(name,.24).add('punch',length=.14,rate=.7).add('spring',.02,.55,.21,.8)
    if name=='corpse-kick': return Sound(name,.15).add('punch',length=.13,rate=1.1)
    if name=='corpse-hit': return Sound(name,.20).add('punch',length=.18,rate=.6).add('wood',.015,.35,.07,.9)
    if name in ('case-floor','case-wall'):
        return Sound(name,.23).add('metal',length=.10,rate=.95 if name=='case-floor' else 1.2).add('metal',.085,.65,.12,1.25)
    if name=='hit-confirm': return Sound(name,.075).add('punch',length=.065,rate=1.8)
    if name=='name-tick': return Sound(name,.12).add('heavy',length=.10,rate=1.15,lowpass=4200).add('wood',.018,.65,.09,.95)
    if name=='name-stamp': return Sound(name,.38).add('heavy',length=.25,rate=.75).add('punch',.018,.7,.20,.65,lowpass=2200).add('gear',.11,.30,.21,.8,lowpass=3500)
    if name=='respawn-tick':
        # A detective's clock: dry wooden tock, low damped body, soft mechanical tail.
        return Sound(name,.55).add('heavy',gain=.6,length=.13,rate=.72,lowpass=1050).add('soft',.012,.28,.16,.8,lowpass=500).bass(38,.012,.49,.7).brush(.06,.34,.20)
    if name=='victory':
        # Small smoky D-minor jazz sign-off, with one crooked muted-horn fall.
        # No drum roll, cymbal crash, bells, high sparkle or major-key fanfare.
        s=Sound(name,2.10).bass(38,0,.65,.70).bass(45,.48,.58,.46).bass(38,1.06,.82,.72)
        s.muted_horn(57,.08,.20,.48).muted_horn(60,.34,.24,.55)
        s.muted_horn(63,.68,.23,.45).muted_horn(62,.93,.91,.62,bend=-1.3)
        # Quiet minor-sixth voicing underneath, kept below the solo line.
        s.muted_horn(53,.95,.74,.12).muted_horn(59,.97,.70,.08)
        s.brush(.02,.22,.22).brush(.51,.22,.18).brush(1.07,.36,.22)
        # A small case-closed thock after the phrase, not a rattle or big crash.
        return s.add('heavy',1.88,.18,.15,.70,lowpass=950)
    raise ValueError('Cue needs a deliberate sound recipe: '+name)

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    catalog=(ROOT/'src/audio/foleyCatalog.ts').read_text()
    names=re.findall(r"(?:'([^']+)'|\b([a-z][a-z-]*)):cue\(",catalog)
    names=[a or b for a,b in names]
    assert len(names)==len(set(names)) and len(names)==13
    previous=json.loads((OUT/'manifest.json').read_text()) if (OUT/'manifest.json').exists() else []
    rejected=ROOT/'output/rejected-foley-assets'
    for row in previous:
        file=row['file']
        if Path(file).name==file and file not in {name+'.wav' for name in names} and (OUT/file).exists():
            rejected.mkdir(parents=True,exist_ok=True); (OUT/file).replace(rejected/file)
    manifest=[make(name).save() for name in names]
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Rendered {len(manifest)} cues, {sum(p.stat().st_size for p in OUT.glob("*.wav")):,} bytes')
