import { createPlayback } from '../contact-playback.js';
import { BUDGETS } from './contract.js';
import { planning, exchange, shield, anonymous, timeline } from './fixture.js';
const $=s=>document.querySelector(s);
const playback=createPlayback();
let view=null,cameraProgress=0;
const reduced=()=>$('#reduced').checked;
$('#reduced').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
const status=text=>{$('#playback-status').textContent=text;};
function stats(){const s=view.inspect();$('#numbers').textContent=`${s.drawCalls} draws / ${s.triangles.toLocaleString()} submitted triangles / r${s.threeRevision}`;}
function draw(){view.render();stats();}
function setCamera(p){cameraProgress=p;view.setCamera(p);}
function planningState(){view.clearEffect();view.applyProjection(planning);setCamera(0);draw();$('#phase').textContent='Planning / deep focus';$('#caption').textContent='Monoceros / Sparrowhawk / Shard - three painted white-metal frigates.';}
function buttons(running){$('#exchange').disabled=running;$('#pause').disabled=$('#skip').disabled=!running;$('#pause').textContent='Pause';}
async function play(){
  buttons(true);status('Camera and effects share active playback time.');
  try{
    await playback.run(timeline,{
      reduced,frameBeat:reduced()?0:300,
      async onFrame(index,{hold,alive}){
        const packet=timeline[index].frame;view.applyProjection(packet);view.clearEffect();
        const target=packet.phase==='resolution'?1:0,start=cameraProgress;
        $('#phase').textContent=target?'Resolution / tabletop macro':'Planning / deep focus';
        if(start!==target){await hold(reduced()||playback.skipping?0:BUDGETS.cameraMoveMs,p=>{setCamera(start+(target-start)*p);draw();});}
        if(alive()){setCamera(target);draw();}
      },
      onEvent(e){$('#caption').textContent=e.kind==='shield-flare'?'Authored own-shield confirmation — not inferred from “resolved”.':'Both event endpoints are disclosed. The beam starts on the confirmed source muzzle.';},
      durationFor:e=>e.kind==='beam'?BUDGETS.beamMs:BUDGETS.shieldMs,
      onTick(e,p){view.setEffect(e,p);draw();},onEventEnd(){view.clearEffect();draw();}
    });
  }finally{planningState();buttons(false);status('Exchange complete. Planning holds still.');}
}
$('#exchange').onclick=()=>play().catch(showError);
$('#pause').onclick=()=>{if(playback.paused){playback.resume();$('#pause').textContent='Pause';status('Playback resumed.');}else{playback.pause();$('#pause').textContent='Resume';status('Paused — camera and effects are held.');}};
$('#skip').onclick=()=>playback.skip();
function showError(error){console.error(error);$('#fallback').hidden=false;$('#status').textContent=error.message;buttons(false);$('#exchange').disabled=true;status('Prototype unavailable; SVG Fleet Command is available.');}
try{
  const response=await fetch('./assets.json');if(!response.ok)throw new Error('Prototype asset manifest unavailable');
  const {createTabletop}=await import('./renderer.js');
  view=await createTabletop($('#tabletop'),await response.json(),planning);
  $('#fallback').hidden=true;view.setClearVariant(new URLSearchParams(location.search).get('insert')==='clear');planningState();buttons(false);status('Planning holds still.');
  new ResizeObserver(()=>{view.resize();draw();}).observe($('#tabletop'));
  // Deterministic review hooks for this isolated fixture. Nothing here reads or accepts battle state.
  window.tabletopPrototype=Object.freeze({
    ready:true,setClearVariant(enabled){const result=view.setClearVariant(enabled);stats();return result;},regionEvidence:()=>view.regionEvidence(),brushEvidence:()=>view.brushEvidence(),captureDetail:(angle,faction)=>view.captureDetail(angle,faction),lightsOffEvidence:()=>view.lightsOffEvidence(),inspect:()=>view.inspect(),play,
    pause:()=>playback.pause(),resume:()=>playback.resume(),skip:()=>playback.skip(),
    cancel:()=>{playback.cancel();planningState();},
    get paused(){return playback.paused;},get running(){return playback.running;},
    capturePose(kind='planning',phase=.5){playback.cancel();const f=kind==='beam'?exchange:kind==='shield'?shield:kind==='anonymous'?anonymous:planning;
      view.applyProjection(f);setCamera(kind==='planning'?0:1);view.setEffect(f.events[0],phase);
      $('#phase').textContent=kind==='planning'?'Planning / deep focus':'Resolution / tabletop macro';
      $('#caption').textContent=kind==='beam'?'Both endpoints disclosed. Confirmed source muzzle, above the board.':kind==='shield'?'Authored own-shield confirmation; not inferred from resolved.':kind==='anonymous'?'Origin unresolved. A neutral radial cue makes no bearing or shooter claim.':'Monoceros / Sparrowhawk / Shard - three painted white-metal frigates.';
      draw();return view.inspect();},
    depthEvidence:()=>view.depthEvidence(),
    renderForReview:()=>view.render(),
    physicalInvariant(){
      const hash=a=>{let h=2166136261;for(const n of a){h^=n;h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
      view.render({effects:false});const a=hash(view.physicalPixels()),sa=hash(view.shadowPixels());
      view.render({effects:true});const b=hash(view.physicalPixels()),sb=hash(view.shadowPixels());
      return {physicalBefore:a,physicalAfter:b,shadowBefore:sa,shadowAfter:sb,identical:a===b&&sa===sb};
    }
  });
}catch(error){showError(error);}
