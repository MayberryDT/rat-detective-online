/** Static UI only. No game, network, audio, pointer lock or input automation. */
import '../../src/style.css';
import { PlayerSettings } from '../../src/ui/PlayerSettings';
import { PreferenceStore } from '../../src/settings/PlayerPreferences';
const prefs=new PreferenceStore({getItem:()=>null,setItem:()=>{}}),menu=new PlayerSettings(prefs);
const params=new URLSearchParams(location.search);
if(params.has('hud')){
    const [{DispatchHud},{createAssignment},THREE,{AssignmentDestinations}]=await Promise.all([
        import('../../src/prototype/DispatchHud'),import('../../src/shared/assignments'),import('three'),import('../../src/prototype/AssignmentDestinations')]);
    prefs.update({uiScale:Number(params.get('scale')??1)});
    if(innerHeight<=500){await import('../../src/ui/touchControls.css');document.body.classList.add('touch-mode');}
    document.getElementById('title-settings-btn')!.remove();
    const assignment=createAssignment('jurisdiction',0);assignment.phase='active';assignment.liveAt=0;
    const state={time:12000,dispatch:{phase:'ready',started:0,until:0,serial:0},case:{owner:'local',p:{x:0,y:0,z:0}},possession:{},assignment} as unknown as import('../../src/shared/chaosState').ChaosState;
    const hud=new DispatchHud(()=>{});hud.update(state,9000,'YOU',true);hud.update(state,12000,'YOU',true);
    const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,600);camera.position.set(0,4,6);camera.lookAt(0,2,0);camera.updateMatrixWorld();
    const guidance=new AssignmentDestinations();await document.fonts.ready;guidance.updateCue(assignment,camera,{x:0,y:0,z:0});
}else if(params.has('pause')){menu.attach({playing:()=>true,touch:()=>false,clear:()=>{},resume:()=>{}});menu.pause();}else menu.open();
