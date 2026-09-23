import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const scripts = path.resolve(import.meta.dirname, '../../omarchy/plugin/scripts');
function python(body) {
  const r = spawnSync('python3', ['-c', `import os, tempfile\nroot=tempfile.TemporaryDirectory()\nos.environ.update({k:root.name+'/'+k for k in ['HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','XDG_RUNTIME_DIR']})\n${body}`], {encoding:'utf8', env:{...process.env,PYTHONPATH:scripts}});
  assert.equal(r.status,0,r.stderr+r.stdout);
}
test('capture attaches audio before game streams exist and reconciles late/replaced streams',()=>python(`
from unittest.mock import patch
from highlights.service import HighlightsService
from highlights import audio
svc=HighlightsService(fake=True)
svc.enabled=True
svc.fake=False
windows=[dict(pid=123,address='game',x=0,y=0,width=640,height=480)]
svc.capture.forced_source=dict(sourceKind='region',matchesGameWindow=True,label='Rat Detective')
with patch.object(audio,'ensure_game_route',return_value=dict(source=audio.capture_source(),streams=0)), patch.object(svc.capture,'start', wraps=svc.capture.start) as start:
    result=svc._confirm_active_source(windows,'Rat Detective',window='region',keep_running=True)
    assert start.call_args.args[1] == audio.capture_source()
    assert result['audio']['state']=='waiting',result
with patch.object(audio,'ensure_game_route',return_value=dict(source=audio.capture_source(),streams=1)) as route:
    svc.audio_retry_at=0
    svc._reconcile_audio()
    assert svc.snapshot()['audio']['state']=='ready'
    svc.audio_retry_at=0
    svc._reconcile_audio()
    assert route.call_count==2
with patch.object(audio,'ensure_game_route',side_effect=audio.AudioError('Could not isolate the game audio stream.')) as route:
    svc.audio_retry_at=0
    svc._reconcile_audio()
    svc._reconcile_audio()
    assert route.call_count==1
    assert svc.snapshot()['audio']['state']=='error'
    assert 'isolate' in svc.snapshot()['audio']['reason']
with patch.object(audio,'cleanup_owned_routes') as cleanup:
    svc.disable()
    assert cleanup.called
`));

test('sink failure never starts a video-only recorder; disable during arming cleans up',()=>python(`
from unittest.mock import patch
from highlights.service import HighlightsService
from highlights import audio
svc=HighlightsService(fake=True)
svc.enabled=True
svc.fake=False
windows=[dict(pid=123,address='game',x=0,y=0,width=640,height=480)]
with patch.object(audio,'ensure_game_route',side_effect=audio.AudioError('Could not create the highlight audio sink.')),patch.object(svc.capture,'start') as start:
    response=svc._confirm_active_source(windows,'game',window='region',keep_running=True)
    assert not response['sourceConfirmed'] and not response['ok']
    assert response['audio']['state']=='error'
    start.assert_not_called()
def disable_while_starting(*args,**kwargs):
    svc.enabled=False
with patch.object(audio,'ensure_game_route',return_value=dict(source=audio.capture_source(),streams=0)),patch.object(svc.capture,'start',side_effect=disable_while_starting),patch.object(audio,'cleanup_owned_routes') as clean:
    svc._confirm_active_source(windows,'game',window='region',keep_running=True)
    assert not svc.source_confirmed
    clean.assert_called()
`));

test('routing creates one sink and loopback, retains original output, replaces streams and cleans only owned modules',()=>python(`
from unittest.mock import patch
from subprocess import CompletedProcess
from highlights import audio
router=audio.AudioRouter()
calls=[]
streams=[]
def run(args,**kw):
    calls.append(args)
    out=''
    if 'get-default-sink' in args: out='speakers'
    if 'module-null-sink' in args: out='12'
    if 'module-loopback' in args: out='13'
    return CompletedProcess(args,0,out,'')
with patch.object(audio,'which',return_value='pactl'),patch.object(audio,'_run',side_effect=run),patch.object(audio,'streams_for_pid',side_effect=lambda pid:streams):
    assert audio.ensure_game_route(1,router)['streams']==0
    streams.append(dict(index=20,sink=4))
    assert audio.ensure_game_route(1,router)['streams']==1
    streams[0]['sink']=99
    audio.ensure_game_route(1,router)
    assert router.original_sinks=={20:'4'}
    assert len([c for c in calls if 'load-module' in c])==2
    streams[:]=[dict(index=21,sink=5)]
    audio.ensure_game_route(1,router)
    assert router.original_sinks=={21:'5'}
    audio.cleanup_owned_routes(router)
    assert ['pactl','move-sink-input','21','5'] in calls
    assert [c[-1] for c in calls if 'unload-module' in c]==['13','12']
    assert not router.module_ids
    before=len(calls)
    audio.cleanup_owned_routes(router)
    assert len(calls)==before
`));

test('browser audio ownership requires the dedicated launcher profile and excludes other applications',()=>python(`
from pathlib import Path
from unittest.mock import patch
from highlights import audio
profile=Path(os.environ['XDG_DATA_HOME'])/'rat-detective/webapp-profile'
streams=[dict(index=1,properties={'application.process.id':'40'}),dict(index=2,properties={'application.process.id':'500','media.name':'Rat Detective','application.process.binary':'chromium'}),dict(index=3,properties={'application.process.id':'600','media.name':'Microphone'})]
with patch.object(audio,'pactl_sink_inputs',return_value=streams),patch.object(audio,'descendant_pids',return_value={30,40}),patch.object(Path,'read_bytes',return_value=os.fsencode('--user-data-dir='+str(profile))+b'\\0'):
    assert [s['index'] for s in audio.streams_for_pid(30)]==[1]
with patch.object(Path,'read_bytes',return_value=b'chromium\\0'),patch.object(audio,'_ppid',return_value=1):
    assert audio.streams_for_pid(500)==[]
`));

test('export preferences persist independently; helper dates, paths and queued names agree without overwrites',()=>python(`
from pathlib import Path
from unittest.mock import patch
import json
from highlights import paths, export_options
from highlights.export import ExportError
from highlights.service import HighlightsService
svc=HighlightsService(fake=True)
options=dict(folder=str(Path(os.environ['HOME'])/'My exports é'),dated=True,size='720p',quality='high',sound=False)
response=svc._helper(dict(type='set-settings',payload={'export':options}))
assert response['exportSettings']==options
svc._helper(dict(type='set-settings',payload={'profile':'light'}))
svc.enable()
svc2=HighlightsService(fake=True)
assert svc2.export_settings==options and svc2.enabled and svc2.profile=='light'
naming=export_options.defaults(1800000000)
assert '2027-' in naming['filename'] and naming['filename'].endswith('.mp4')
assert 'Reel' in export_options.defaults(1800000000,True)['filename']
folder=Path(options['folder']); folder.mkdir(parents=True)
dest=export_options.destination({'filename':'My clip é'},options,naming)
assert dest.parent==folder/naming['datePath']
dest.write_text('original')
next_dest=export_options.destination({'filename':'My clip é'},options,naming,[str(dest.with_name('My clip é (2).mp4'))])
assert next_dest.name=='My clip é (3).mp4' and dest.read_text()=='original'
assert export_options.destination({'destination':str(folder)},options,naming).parent==folder
assert export_options.destination({'folder':str(folder),'filename':'Chosen folder'},options,naming).parent==folder
for name in ['../bad','a/b','a\\\\b','']:
    if not name: continue
    try: export_options.destination({'filename':name},options,naming)
    except ExportError: pass
    else: raise AssertionError(name)
svc.exports.stop()
with patch.object(svc.exports,'start'):
    observed=[]
    def work(dest,opts,progress):
        observed.append(opts)
        return {}
    first=svc._queue_export('clip',{'filename':'Queued'},naming,work)
    second=svc._queue_export('clip',{'filename':'Queued'},naming,lambda *args: {})
    assert first['job']['destination']!=second['job']['destination']
    svc.export_settings={**options,'sound':True,'quality':'standard'}
    svc.exports._work[first['job']['id']](lambda value:None)
    assert observed==[options],observed
    invalid=svc._queue_export('clip',{'folder':str(dest)},naming,work)
    assert invalid['ok'] is False and 'unavailable' in invalid['error']
    assert dest.read_text()=='original'
svc.exports.stop(); svc2.exports.stop()
`));

test('decoded audio and visual cue stay in sync through saved cuts, exports and mixed silent reels',()=>python(`
import runpy, sys
fixture=${JSON.stringify(path.resolve(import.meta.dirname, 'fixtures/highlights-audio-media.py'))}
sys.argv=[fixture,root.name+'/media']
runpy.run_path(fixture,run_name='__main__')
`));

test('concurrent catalog reads retain complete rows during capture and audio probing',()=>python(`
from concurrent.futures import ThreadPoolExecutor
from highlights.library import Library
lib=Library()
lib.create_session('known','epoch')
def read(_):
    for i in range(2000):
        rows=lib.list_sessions()
        assert len(rows)==1 and rows[0]['id']=='known',rows
with ThreadPoolExecutor(4) as pool:
    list(pool.map(read,range(4)))
lib.close()
`));
