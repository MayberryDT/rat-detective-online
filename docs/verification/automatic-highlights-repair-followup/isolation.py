import sys, os, tempfile, json, importlib.util
from pathlib import Path
from unittest.mock import patch
sys.dont_write_bytecode=True
scripts=Path.cwd()/'omarchy/plugin/scripts'
sys.path.insert(0,str(scripts))
spec=importlib.util.spec_from_file_location('desktop',scripts/'rat-detective-desktop.py')
desktop=importlib.util.module_from_spec(spec);spec.loader.exec_module(desktop)
windows=[{'pid':12345,'class':'co.animasai.rat-detective','title':'Rat Detective'}]
requests=[]
with patch.object(desktop,'game_windows',return_value=windows),patch.object(desktop,'highlights_request',side_effect=lambda payload: requests.append(payload) or {'ok':True}),patch.object(desktop,'print_json',return_value=0):
 desktop.highlights_setup(None)
payload=requests[0]
with tempfile.TemporaryDirectory(prefix='rat-highlight-followup-') as tmp:
 for key,leaf in [('XDG_CONFIG_HOME','config'),('XDG_STATE_HOME','state'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','run'),('RAT_DETECTIVE_HIGHLIGHTS_VIDEOS','videos')]:
  os.environ[key]=str(Path(tmp)/leaf)
 from highlights.service import HighlightsService
 from highlights.protocol import new_id
 svc=HighlightsService(fake=True);svc.enable()
 with patch.object(svc.capture,'inspect_source',return_value={'sourceKind':'monitor','matchesGameWindow':False,'label':'Test monitor'}) as inspect:
  result=svc.confirm_setup(payload)
  start=svc.handle(json.dumps({'version':1,'channel':'browser','type':'session-start','messageId':new_id(),'sessionId':new_id(),'documentEpoch':new_id(),'sequence':1,'origin':'https://ratdetective.online','joined':True,'observing':False}).encode())
  output={'cli_constructed_evidence':payload['portalEvidence'],'inspector_source':'monitor','setup_source_confirmed':result['sourceConfirmed'],'session_start_status':start['status'],'capture_ready_after_start':svc.capture.status()['ready'],'source_inspection_calls_total':inspect.call_count}
  assert result['sourceConfirmed'] is True
  assert start['status']=='accepted' and svc.capture.status()['ready'] is True
  assert inspect.call_count==1
 svc.capture.stop();svc.library.close()
print(json.dumps(output,indent=2))
