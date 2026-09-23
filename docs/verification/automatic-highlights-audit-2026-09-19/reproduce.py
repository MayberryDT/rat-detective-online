import os, sys, json, tempfile, time
from pathlib import Path
from unittest.mock import patch
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path.cwd() / 'omarchy/plugin/scripts'))
results = {}
with tempfile.TemporaryDirectory(prefix='rat-highlights-audit-') as tmp:
    root = Path(tmp)
    for key, leaf in [('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_STATE_HOME','state'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime'),('RAT_DETECTIVE_HIGHLIGHTS_VIDEOS','videos')]:
        os.environ[key] = str(root / leaf)
    from highlights.library import Library
    from highlights import paths
    from highlights.tuning import STORAGE_BUDGET_BYTES, LOW_SPACE_RESERVE_BYTES
    lib = Library()
    ids=[]
    for i, event in enumerate([100_000, 200_000, 300_000]):
        staging=paths.staging_dir()/f'{i}.mp4'
        staging.write_bytes(b'fixture-not-real-media')
        clip=lib.publish_clip(staging=staging, session_id='session-a', epoch='epoch-a', duration_ms=15000,
          requested_start_ms=event-10000, requested_end_ms=event+5000, actual_start_ms=0, actual_end_ms=15000,
          profile='normal',score=70+i,title=f'Moment {i}',title_key='double-kill',kind='double-kill',detector_version=1,
          truncated=False,uncertainty_ms=0,marker_ids=[f'marker-{i}'],event_ms=event)
        ids.append(clip['id'])
    rows=lib.list_clips()
    assert all('path' not in row for row in rows)
    assert all(lib.clip_path(row).is_file() for row in rows)
    results['playback_contract']={'files_exist':True,'rows_have_path':False,'ui_requires':'selected.path'}
    reel=lib.generate_reel('session-a')
    assert len(reel['items']) == 1
    assert reel['items'][0]['trim_in_ms']==0 and reel['items'][0]['trim_out_ms']==3000
    results['reel']={'events_ms':[100000,200000,300000],'input_clips':3,'output_moments':len(reel['items']),
                     'output_trim_ms':[0,3000],'actual_event_offset_in_each_clip_ms':10000}
    lib.conn.execute('DELETE FROM reel_items')
    lib.conn.execute('UPDATE clips SET bytes=0')
    lib.conn.execute('UPDATE clips SET bytes=? WHERE id=?',(STORAGE_BUDGET_BYTES-LOW_SPACE_RESERVE_BYTES,ids[0]))
    before=lib.can_reserve(1); pruned=lib.prune(); after=lib.can_reserve(1)
    assert not before and not after and not pruned
    results['retention']={'recorded_bytes':STORAGE_BUDGET_BYTES-LOW_SPACE_RESERVE_BYTES,'unprotected_clips':3,
      'can_save_one_byte_before':before,'clips_pruned':len(pruned),'can_save_one_byte_after':after}
    lib.close()
    from highlights.service import HighlightsService
    from highlights.capture import FakeCapture
    from highlights.protocol import new_id
    from highlights.clock import monotonic_ms
    svc=HighlightsService(fake=True)
    svc.enable()
    svc.confirm_setup({'sourceType':'window','sourceLabel':'Rat Detective'})
    def send(message_type, **payload):
        msg={'version':1,'channel':'browser','messageId':new_id(),'sequence':1,'type':message_type,
             'sessionId':'session-primary','documentEpoch':'document-primary',**payload}
        return svc.handle(json.dumps(msg).encode())
    start=send('session-start',origin='https://ratdetective.online',joined=True,observing=False)
    assert start['status']=='accepted'
    now=monotonic_ms()
    svc.scheduler.reset_epoch(svc.capture_epoch,now-20000)
    uncalibrated=send('marker',id=new_id(),roundId='round-primary',kind='double-kill',score=70,preMs=1000,postMs=5000,presentedAtMs=now)
    results['initial_timing']=uncalibrated['reason']
    assert uncalibrated['reason']=='timing not calibrated'
    svc.clock.offset_ms=0
    stale=send('marker',sessionId='session-unrelated',documentEpoch='document-unrelated',id=new_id(),roundId='round-primary',
       kind='double-kill',score=70,preMs=1000,postMs=5000,presentedAtMs=monotonic_ms())
    assert stale['status']=='accepted'
    svc.scheduler.pending.clear()
    ended=send('session-end',sessionId='session-unrelated',documentEpoch='document-unrelated')
    assert ended['status']=='accepted' and svc.session_id is None
    results['session_binding']={'unrelated_marker_status':stale['status'],'unrelated_end_status':ended['status'],'primary_session_stopped':svc.session_id is None}
    svc.fake=False
    cleanup=[]
    with patch('highlights.service.identity.game_windows',return_value=[{'pid':123,'title':'Rat Detective','class':'co.animasai.rat-detective'}]), patch('highlights.service.audio.ensure_game_route',return_value={'source':'fixture.monitor'}), patch('highlights.service.audio.cleanup_owned_routes',side_effect=lambda:cleanup.append(1)):
        setup=svc.confirm_setup({'sourceType':'window','sourceLabel':'Rat Detective'})
        assert setup['sourceConfirmed'] and svc.session_id is None and svc.capture.alive()
        results['setup']={'source_confirmed_without_portal_evidence':setup['sourceConfirmed'],'recorder_started_without_joined_session':svc.capture.alive()}
        svc.disable()
    results['audio_cleanup_on_disable']={'calls':len(cleanup)}
    assert not cleanup
    try:
        svc.handle(b'{"version":1,"type":"bogus"}')
    except Exception as error:
        results['invalid_request_uncaught_exception']=type(error).__name__
    else:
        raise AssertionError('expected uncaught validation exception')
    svc.library.close()
print(json.dumps(results,indent=2))
