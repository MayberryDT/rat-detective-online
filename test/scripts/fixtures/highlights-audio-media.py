"""Decoded signal/sync regression. Generates fictional media, never plays sound."""
import array
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import wave
from urllib.parse import urlparse, unquote
from highlights.export import export_clip, export_reel, probe
from highlights.library import Library
from highlights import paths

root = Path(sys.argv[1]).resolve()
root.mkdir(parents=True, exist_ok=True)
for key in ['HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','XDG_RUNTIME_DIR']:
    os.environ[key] = str(root / key)

def ffmpeg(*args):
    subprocess.run(['ffmpeg','-y','-v','error',*map(str,args)],check=True,capture_output=True)

wav = root/'cue.wav'
with wave.open(str(wav),'wb') as out:
    out.setparams((1,2,48000,0,'NONE','not compressed'))
    samples=array.array('h',(int(6000*math.sin(2*math.pi*440*i/48000)) if .75<=i/48000<1.25 else 0 for i in range(96000)))
    out.writeframes(samples.tobytes())
source=root/'source.mp4'
silent=root/'silent.mp4'
ffmpeg('-f','lavfi','-i','color=black:s=160x96:r=60:d=2','-i',wav,'-vf',"drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,0.75,1.25)'",'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source)
ffmpeg('-f','lavfi','-i','color=black:s=80x48:r=60:d=1','-c:v','libx264','-pix_fmt','yuv420p',silent)
hashes={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in [source,silent]}
spec=importlib.util.spec_from_file_location('preview',Path(__file__).resolve().parents[3]/'omarchy/plugin/scripts/highlights-preview.py')
preview=importlib.util.module_from_spec(spec); spec.loader.exec_module(preview)
cut=Path(unquote(urlparse(preview.prepare(source.as_uri(),300,1600)['playback']).path))
exported=root/'export.mp4'
export_clip(source,exported,300,1600,dict(size='720p',quality='high',sound=True))
no_sound=root/'no-sound.mp4'
export_clip(source,no_sound,300,1600,dict(sound=False))
assert not probe(no_sound)['hasAudio']
assert probe(exported)['width']==160, 'do not upscale'
lib=Library()
clips=[]
for i,p in enumerate([silent,source]):
    staging=paths.staging_dir()/f'{i}.mp4'; staging.write_bytes(p.read_bytes())
    clip=lib.publish_clip(staging=staging,session_id='session',epoch='epoch',duration_ms=probe(p)['durationMs'],
        requested_start_ms=0,requested_end_ms=2000,actual_start_ms=0,actual_end_ms=2000,
        profile='normal',score=70,title='Cue',title_key='manual-save',kind='manual-save',detector_version=1,
        truncated=False,uncertainty_ms=0,marker_ids=[],event_ms=0,event_offset_ms=0,capture_start_ms=0,capture_end_ms=2000)
    assert clip['hasAudio'] is None
    lib.set_audio_info(clip['id'],probe(p)); clips.append(lib.get_clip(clip['id']))
assert clips[0]['hasAudio'] is False and clips[1]['hasAudio'] is True
reel=root/'reel.mp4'
export_reel(lib,[dict(clip_id=clips[0]['id'],trim_in_ms=0,trim_out_ms=1000),dict(clip_id=clips[1]['id'],trim_in_ms=300,trim_out_ms=1600)],reel)

def measure(file, expected):
    audio=array.array('f')
    audio.frombytes(subprocess.check_output(['ffmpeg','-v','error','-i',str(file),'-vn','-ac','1','-ar','48000','-f','f32le','-']))
    windows=[sum(v*v for v in audio[i:i+480])/480 for i in range(0,len(audio),480)]
    onset=next(i*.01 for i,v in enumerate(windows) if v>.001)
    frames=subprocess.check_output(['ffmpeg','-v','error','-i',str(file),'-an','-vf','scale=1:1,format=gray','-f','rawvideo','-'])
    visual=next(i/60 for i,v in enumerate(frames) if v>100)
    rms=math.sqrt(sum(v*v for v in audio)/len(audio))
    assert rms>.015,(file,rms)
    assert abs(onset-visual)<.055,(file,onset,visual)
    assert abs(onset-expected)<.065,(file,onset,expected)
    return dict(audioOnset=onset,visualOnset=visual,rms=rms,**probe(file))
results={}
for name,file,onset in [('source',source,.75),('saved-cut',cut,.45),('clip-export',exported,.45),('mixed-reel',reel,1.45)]:
    results[name]=measure(file,onset)
assert abs(probe(reel)['durationMs']-2300)<100
assert lib.get_clip(clips[0]['id'])['hasAudio'] is False
for file,digest in hashes.items(): assert hashlib.sha256(file.read_bytes()).hexdigest()==digest
(root/'measurements.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
