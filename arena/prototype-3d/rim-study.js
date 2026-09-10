import {createTabletop} from './renderer.js';
import {planning} from './fixture.js';
import {freeze} from './contract.js';
import {createRimLabels,RIM_LIMITS} from './rim-labels.js';
const $=s=>document.querySelector(s);let labels,heading=0;
try{
  await document.fonts.load('bold 192px Arial');
  const manifest=await (await fetch('./assets.json')).json();
  const view=await createTabletop($('#tabletop'),manifest,planning,{createRimStudy:(scene,units)=>(labels=createRimLabels(scene,units))});
  function capture(height=2.6,offset=0,detail=null){
    labels.setHeight(height);heading=offset;
    view.applyProjection(freeze({...planning,units:planning.units.map(u=>({...u,facing:(u.facing+offset)%6}))}));
    if(detail)view.captureDetail('side',detail);else view.setCamera(0);
    view.render();const stats=view.inspect(),measure=view.measureRimStudy();
    $('#study-status').textContent=`${height.toFixed(3)} mm printed capitals; six repeats per rim`;
    $('#numbers').textContent=`${stats.triangles.toLocaleString()} triangles / ${stats.drawCalls} draws`;
    $('#phase').textContent=detail?`${detail} / placement detail`:'Planning / existing camera';
    return {stats,measure,fit:labels.validateFit()};
  }
  const size=()=>$('#height').value==='max'?RIM_LIMITS.maximumCapHeightMm:Number($('#height').value);
  $('#height').onchange=()=>capture(size(),heading);$('#planning').onclick=()=>capture(size(),heading);
  for(const f of ['kre','vra','ear'])$('#'+f).onclick=()=>capture(size(),heading,f.toUpperCase());
  $('#rotate').onclick=()=>capture(size(),(heading+1)%6);
  $('#paper').onchange=()=>{labels.setPaper($('#paper').checked);capture(size(),heading);};
  new ResizeObserver(()=>{view.resize();view.render();}).observe($('#tabletop'));
  window.rimStudy=Object.freeze({ready:true,capture,limits:RIM_LIMITS,lightsOff:()=>view.lightsOffEvidence(),transitSweep:()=>view.measureRimTransit(),
    setPaper(v){labels.setPaper(v);return capture(RIM_LIMITS.maximumCapHeightMm);},
    setVisible(v){labels.setVisible(v);view.render();},fit:()=>labels.validateFit()});capture();
}catch(e){$('#study-status').textContent=e.message;console.error(e);}
