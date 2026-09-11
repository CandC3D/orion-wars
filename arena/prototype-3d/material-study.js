import * as THREE from 'three';
import {GLTFLoader} from './vendor/three-r180/loaders/GLTFLoader.js';
import {buildTable} from './table.js';
import {physicalMesh,physicalMaterial,validateScene} from './materials.js';
import {BOARD,SIZES,mm} from './scale.js';
import {BUDGETS,validateRegionMap} from './contract.js';
import {factionRegion,validateFactionPalette} from './faction-palettes.js';
import {preparePaintGeometry,candidatePaint} from './hull-paint.js';
import {clearInsert} from './clear-insert.js';
import {BASE_APEX,baseGeometry,postGeometry,standScaleRows} from './stands.js';
import {plasticMaterial,transmittingShadow,maskInsertShadow} from './moulded-plastic.js';
import {tabletopReflections} from './room-reflections.js';

const $=s=>document.querySelector(s),canvas=$('#study-canvas');
try{
 const context=canvas.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true});if(!context)throw Error('WebGL2 required for this material comparison');
 const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true});renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.transmissionResolutionScale=1;renderer.info.autoReset=false;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#6f5a42');
 const key=new THREE.DirectionalLight('#ffe0ad',3.1);key.position.set(-25,65,30);key.castShadow=true;
 Object.assign(key.shadow.camera,{left:-59,right:59,top:44,bottom:-44,near:1,far:150});key.shadow.mapSize.set(2048,2048);key.shadow.normalBias=.012;key.shadow.bias=-.00025;scene.add(key);
 scene.add(new THREE.HemisphereLight('#d5deeb','#75614b',1.3));buildTable(scene);
 const reflection=tabletopReflections(renderer,scene),camera=new THREE.PerspectiveCamera(18,1,1,250);
 const [gltf,map,source]=await Promise.all([new GLTFLoader().loadAsync('./prepared/crystal.glb'),fetch('./prepared/crystal-regions.json').then(r=>r.json()),fetch('./comparison-source.json').then(r=>r.json())]);
 const palette=Object.keys(source.colours).map(k=>factionRegion('VRA',k));validateFactionPalette('VRA',map.palette.map(p=>p.key),{expectedKeys:Object.keys(source.colours)});validateRegionMap(map,'VRA',{palette,confirmedEffects:[]});
 gltf.scene.updateMatrixWorld(true);const sourceMeshes=[];gltf.scene.traverse(o=>{if(o.isMesh)sourceMeshes.push(o);});if(sourceMeshes.length!==1)throw Error('Re-inspect changed Crystal export');
 const src=sourceMeshes[0],raw=src.geometry.clone().applyMatrix4(src.matrixWorld),geometry=preparePaintGeometry(raw,'VRA',palette);
 const paint=candidatePaint('VRA',geometry);paint.name='Crystal / authored faction palette';paint.envMap=reflection.texture;paint.envMapIntensity=.6;
 const hull=physicalMesh('Crystal / current source geometry',geometry,paint);maskInsertShadow(hull);
 const insert=clearInsert(geometry,map);insert.material.envMap=reflection.texture;insert.material.envMapIntensity=.6;hull.add(insert);scene.add(hull);
 const hit=new THREE.Raycaster(new THREE.Vector3(0,-10,0),new THREE.Vector3(0,1,0)).intersectObject(hull,false)[0];if(!hit)throw Error('Crystal post misses underside');
 const attachment=hit.point.clone();hull.position.y=BOARD.top+BASE_APEX+mm(SIZES.postHeight)-attachment.y;
 const black=physicalMaterial('black cast stand paint',{color:'#151513',roughness:.86});
 const postMaterial=plasticMaterial({name:'Crystal / approved clear tapered post',post:true});postMaterial.envMap=reflection.texture;postMaterial.envMapIntensity=.6;
 const base=physicalMesh('Crystal / pyramid base',baseGeometry(),black),post=physicalMesh('Crystal / clear tapered post',postGeometry(),postMaterial);transmittingShadow(post,.10);scene.add(base,post);base.position.y=BOARD.top;post.position.y=BOARD.top+BASE_APEX+mm(SIZES.postHeight/2);
 const studyPosts=[];
 for(const [x,clear] of [[-2.2,false],[2.2,true]]){
  const b=physicalMesh('Comparison / black pyramid',baseGeometry(),black),g=postGeometry(64);
  g.setAttribute('opticalVolume',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  const material=clear?plasticMaterial({name:'Comparison / clear moulded styrene post',post:true}):black;
  if(clear){material.envMap=reflection.texture;material.envMapIntensity=.6;}
  const p=physicalMesh(clear?'Clear post / approved':'Black post / retired comparison',g,material);if(clear)transmittingShadow(p,.10);
  b.position.set(x,BOARD.top,0);p.position.set(x,BOARD.top+BASE_APEX+mm(SIZES.postHeight/2),0);scene.add(b,p);studyPosts.push(b,p);
 }
 const scaleRows=standScaleRows(base.geometry,post.geometry);
 let mode='clear',angle='side',transmissionAllocated=true;
 function size(){const r=canvas.getBoundingClientRect(),scale=Math.min(1,Math.sqrt(BUDGETS.maxPixels/(r.width*r.height)));renderer.setSize(Math.round(r.width*scale),Math.round(r.height*scale),false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
 function pose(){
  const posts=mode==='posts';hull.visible=base.visible=post.visible=!posts;for(const p of studyPosts)p.visible=posts;
  insert.visible=mode==='clear';paint.userData.clearVariant.value=insert.visible?1:0;
  if(posts||insert.visible)transmissionAllocated=true;
  const target=posts?new THREE.Vector3(0,2.3,0):new THREE.Vector3(0,hull.position.y+.3,0);
  const pos=angle==='plan'?[0,28,12]:posts?[0,24,26]:[7,24,26];
  if(angle==='detail'&&!posts)target.set(2.2,hull.position.y+.48,1.3);
  camera.position.set(...pos);camera.fov=posts?11:angle==='detail'?6.5:15;camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const pitch=Math.asin(-camera.getWorldDirection(new THREE.Vector3()).y)*180/Math.PI;if(camera.position.y<BUDGETS.cameraFloor||pitch<BUDGETS.pitchFloor)throw Error('Study camera crossed a floor');
  $('#study-title').textContent=posts?'Cast stand / black and clear':'Crystal heavy cruiser / '+(insert.visible?'moulded clear green':'painted green');
  $('#study-caption').textContent=posts?'Identical geometry and height. Left: retired black. Right: approved clear.':'Eight actual green patches. The geometry and camera stay fixed between variants.';
 }
 function render(){renderer.info.reset();renderer.render(scene,camera);validateScene(scene);const r=inspect();if(r.triangles>90000||r.drawCalls>110||r.estimatedTargetMiB>160)throw Error('Material study exceeds its separate budget');$('#study-stats').textContent=r.triangles.toLocaleString()+' triangles / '+r.drawCalls+' draws';return r;}
 function inspect(){return {mode,angle,camera:{position:camera.position.toArray(),fov:camera.fov,pitch:Math.asin(-camera.getWorldDirection(new THREE.Vector3()).y)*180/Math.PI},drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,width:canvas.width,height:canvas.height,estimatedTargetMiB:(canvas.width*canvas.height*(transmissionAllocated?60:0)+2048**2*4)/1048576,attachment:attachment.toArray(),stand:scaleRows,insert:insert.userData.evidence,energyObjects:0,blackPostsDefault:false,clearPostsDefault:true,sourceRegionAreas:map.sourceCoverage};}
 function capture(m='clear',a='side'){if(!['paint','clear','posts'].includes(m)||!['side','plan','detail'].includes(a))throw Error('Unknown comparison');mode=m;angle=a;pose();return render();}
 function lightsOff(){const lights=scene.children.filter(o=>o.isLight).map(o=>[o,o.intensity]),materials=new Set();scene.traverse(o=>{if(o.isMesh&&o.material.envMap)materials.add(o.material);});
  const bg=scene.background;scene.background=new THREE.Color(0);for(const [l] of lights)l.intensity=0;for(const m of materials)m.envMapIntensity=0;render();
  const gl=renderer.getContext(),pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let nonzero=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]||pixels[i+1]||pixels[i+2])nonzero++;
  scene.background=bg;for(const [l,v] of lights)l.intensity=v;for(const m of materials)m.envMapIntensity=.6;render();return {nonzeroPhysicalPixels:nonzero};}
 size();capture();new ResizeObserver(()=>{size();render();}).observe(canvas);
 for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>capture(b.dataset.view,angle);$('#study-angle').onclick=()=>capture(mode,{side:'plan',plan:'detail',detail:'side'}[angle]);
 function opticsEvidence(m){capture(m,m==='clear'?'detail':'side');const mat=m==='clear'?insert.material:studyPosts[3].material;mat.userData.opticalAudit.value=1;render();
  const gl=renderer.getContext(),pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const depths=[];
  for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]===239&&pixels[i+2]===16)depths.push(pixels[i]/255*20);
  depths.sort((a,b)=>a-b);mat.userData.opticalAudit.value=0;render();return {pixels:depths.length,floorPixels:depths.filter(v=>v<.04).length,minimumMm:depths[0],medianMm:depths[Math.floor(depths.length/2)],maximumMm:depths.at(-1),quantizationMm:20/255};
 }
 function shadowEvidence(){capture('posts','side');const p=studyPosts[3],coverage=p.customDepthMaterial.userData.coverage,saved=coverage.value;
  const read=()=>{render();const rt=key.shadow.map,a=new Uint8Array(rt.width*rt.height*4);renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,a);return a;};
  coverage.value=0;const none=read();coverage.value=saved;const transmitted=read();coverage.value=1;const opaque=read();coverage.value=saved;render();
  const changed=a=>{let n=0;for(let i=0;i<a.length;i+=4)if([0,1,2,3].some(k=>a[i+k]!==none[i+k]))n++;return n;};
  return {transmittedPixels:changed(transmitted),opaquePixels:changed(opaque),coverage:saved};
 }
 window.materialStudy=Object.freeze({ready:true,capture,inspect,lightsOff,opticsEvidence,shadowEvidence});$('#study-status').textContent='Comparison ready';
}catch(e){$('#study-status').textContent=e.message;console.error(e);}
