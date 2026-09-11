import * as THREE from 'three';
import {GLTFLoader} from './vendor/three-r180/loaders/GLTFLoader.js';
import {buildTable} from './table.js';
import {physicalMesh,physicalMaterial,validateScene} from './materials.js';
import {BOARD,SIZES,mm} from './scale.js';
import {validateRegionMap,cameraPose} from './contract.js';
import {factionRegion} from './faction-palettes.js';
import {preparePaintGeometry,candidatePaint} from './hull-paint.js';
import {BASE_APEX,baseGeometry,postGeometry} from './stands.js';
import {tabletopReflections} from './room-reflections.js';
import {classRim} from './rim-labels.js';
import {mountFleetHull} from './fleet-mount.js';
import {validateFleetManifest,fleetHull} from './fleet-contract.js';
const canvas=document.querySelector('canvas'),status=document.querySelector('#status');
try{
 const manifest=validateFleetManifest(await (await fetch('./fleet-assets.json')).json());
 const inventory=await (await fetch('./prepared/fleet/inventory.json')).json();
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,720,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.info.autoReset=false;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#6f5a42');
 const key=new THREE.DirectionalLight('#ffe0ad',3.1);key.position.set(-25,65,30);key.castShadow=true;Object.assign(key.shadow.camera,{left:-59,right:59,top:44,bottom:-44,near:1,far:150});key.shadow.mapSize.set(2048,2048);key.shadow.normalBias=.012;key.shadow.bias=-.00025;scene.add(key);scene.add(new THREE.HemisphereLight('#d5deeb','#75614b',1.3));buildTable(scene);
 const reflection=tabletopReflections(renderer,scene),perspective=new THREE.PerspectiveCamera(20,1000/720,1,250),ortho=new THREE.OrthographicCamera(-15,15,10.8,-10.8,1,250);
 const black=physicalMaterial('black FASA base and tapered stand',{color:'#151513',roughness:.86,metalness:0});
 let assembly=null,hull=null,current=null,map=null,record=null,camera=perspective,post=null,base=null,rim=null,mount=null;
 function dispose(){if(!assembly)return;scene.remove(assembly);const disposed=new Set();const release=r=>{if(!r||r===black||disposed.has(r))return;disposed.add(r);r.dispose?.();};assembly.traverse(o=>{if(!o.isMesh)return;release(o.geometry);for(const m of [o.material,o.customDepthMaterial]){if(!m)continue;release(m.userData.paintEdges);release(m.userData.opticalPlanes);release(m.map);release(m);}});}
 async function load(id){
  current=fleetHull(manifest,id);record=inventory.hulls.find(h=>h.id===id);
  const [gltf,regions]=await Promise.all([new GLTFLoader().loadAsync('./prepared/fleet/'+id+'.glb'),fetch('./prepared/fleet/'+id+'-regions.json').then(r=>r.json())]);
  const palette=Object.keys(record.regions).map(k=>factionRegion(current.faction,k));map=validateRegionMap(regions,current.faction,{palette,confirmedEffects:current.pointDefence?['pointDefenceEmitter']:[]});
  gltf.scene.updateMatrixWorld(true);const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});if(meshes.length!==1)throw Error('Changed prepared mesh count');
  const src=meshes[0],raw=src.geometry.clone().applyMatrix4(src.matrixWorld),paintGeometry=preparePaintGeometry(raw,current.faction,palette);raw.dispose();src.geometry.dispose();src.material.dispose();
  const material=candidatePaint(current.faction,paintGeometry);material.name=current.name+' / complete faction contract';material.envMap=reflection.texture;material.envMapIntensity=.6;
  dispose();mount=mountFleetHull(current,paintGeometry,material,map,reflection.texture);assembly=mount.group;hull=mount.hulls;post=mount.post;base=mount.base;rim=mount.rim;scene.add(assembly);
  assembly.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(hull);if(bounds.min.y<BOARD.top)throw Error('Hull intersects table');
  status.textContent=current.name+' / '+(current.code??'code pending');return capture('quarter');
 }
 function screenBounds(object){const box=new THREE.Box3().setFromObject(object),points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).project(camera));const xs=points.map(p=>(p.x+1)*500),ys=points.map(p=>(1-p.y)*360);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
 function measurements(){
  const p=new THREE.Box3().setFromObject(post),b=new THREE.Box3().setFromObject(base),ray=new THREE.Raycaster(new THREE.Vector3(0,p.min.y-.01,0),new THREE.Vector3(0,1,0)),hit=ray.intersectObject(hull,true)[0];
  const faces=rim?rim.geometry.userData.rim.faces.map(f=>{const centre=f.centre.clone().applyMatrix4(rim.matrixWorld),normal=f.normal.clone().transformDirection(rim.matrixWorld),a=f.centre.clone().addScaledVector(f.up,-f.inkHeight/2).applyMatrix4(rim.matrixWorld).project(camera),z=f.centre.clone().addScaledVector(f.up,f.inkHeight/2).applyMatrix4(rim.matrixWorld).project(camera);return {front:normal.dot(camera.position.clone().sub(centre))>0,capPixels:Math.hypot((a.x-z.x)*500,(a.y-z.y)*360)};}):[];
  return {postExposedMm:(p.max.y-p.min.y)*10,postBaseGapMm:(p.min.y-b.max.y)*10,postHullGapMm:mount.frame?Math.abs(new THREE.Box3().setFromObject(mount.frame).max.y-p.max.y)*10:Math.abs(mount.hulls.children[0].position.y+mount.attachment.y-p.max.y)*10,rimCapPixels:faces.filter(f=>f.front).map(f=>f.capPixels)};
 }
 function render(){renderer.info.reset();renderer.render(scene,camera);validateScene(scene);if(renderer.info.render.triangles>1200000)throw Error('Single-model inspection triangle cap exceeded');return {id:current.id,view,camera:{position:camera.position.toArray(),pitch:Math.asin(-camera.getWorldDirection(new THREE.Vector3()).y)*180/Math.PI,fov:camera.fov??null,orthographic:camera.isOrthographicCamera===true,projection:camera.projectionMatrix.toArray()},triangles:renderer.info.render.triangles,draws:renderer.info.render.calls,miniatureLengthMm:mount.singleCraftLengthMm,flightCount:mount.aircraft,formationMm:new THREE.Box3().setFromObject(hull).getSize(new THREE.Vector3()).toArray().map(v=>v*10),clearPosts:true,clearCrystals:mount.crystals.length,brush:mount.hulls.children[0].geometry.userData.paint,bounds:screenBounds(assembly),hullBounds:screenBounds(hull),regions:map.palette.map(p=>({key:p.key,classification:p.classification,metal:p.metal,physicalEmission:p.physicalEmission})),energyObjects:0,clearVariant:false,code:current.code,...measurements(),sourceLengthM:record.calibratedLengthM};}
 let view='quarter';
 function capture(kind){view=kind;assembly.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(assembly),target=box.getCenter(new THREE.Vector3());target.x=target.z=0;
  if(kind==='strip'){
   camera=ortho;camera.position.set(0,24,(24-5)/Math.tan(33*Math.PI/180));camera.lookAt(0,5,0);camera.updateProjectionMatrix();
  }else{
   camera=perspective;camera.position.set(kind==='quarter'?28:0,kind==='quarter'?63:24,kind==='quarter'?44:(24-target.y)/Math.tan(33*Math.PI/180));camera.lookAt(target);camera.fov=25;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
   // Fitted inspection views: one common orientation per view, with the full miniature and support inside the frame.
   for(let i=0;i<3;i++){const b=screenBounds(assembly),ratio=Math.max(b.width/850,b.height/580);camera.fov=2*Math.atan(Math.tan(camera.fov*Math.PI/360)*ratio)*180/Math.PI;camera.updateProjectionMatrix();}
  }
  camera.updateMatrixWorld(true);const pitch=Math.asin(-camera.getWorldDirection(new THREE.Vector3()).y)*180/Math.PI;if(camera.position.y<24||pitch<32)throw Error('Inspection camera crossed floor');
  return render();
 }
 function blackout(){const lights=[],materials=[];scene.traverse(o=>{if(o.isLight){lights.push([o,o.intensity]);o.intensity=0;}if(o.isMesh&&o.material.envMap&&!materials.some(([m])=>m===o.material)){materials.push([o.material,o.material.envMapIntensity]);o.material.envMapIntensity=0;}});const bg=scene.background;scene.background=new THREE.Color(0);render();const gl=renderer.getContext(),px=new Uint8Array(1000*720*4);gl.readPixels(0,0,1000,720,gl.RGBA,gl.UNSIGNED_BYTE,px);let count=0;for(let i=0;i<px.length;i+=4)if(px[i]||px[i+1]||px[i+2])count++;for(const [l,v] of lights)l.intensity=v;for(const [m,v] of materials)m.envMapIntensity=v;scene.background=bg;render();return count;}

 function planningFlight(){
  if(mount.aircraft!==6)throw Error('Planning flight evidence needs a six-craft unit');
  // Separate evidence view: never changes either contact-sheet inspection camera.
  const w=1514,h=750,pose=cameraPose(0),game=new THREE.PerspectiveCamera(pose.fov,w/h,1,250);
  game.position.set(pose.x,pose.y,pose.z);game.lookAt(0,pose.targetY,0);game.updateMatrixWorld(true);
  renderer.setSize(w,h,false);canvas.style.width=w+'px';canvas.style.height=h+'px';renderer.render(scene,game);
  const boxes=mount.hulls.children.map(craft=>{const b=new THREE.Box3().setFromObject(craft),points=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(new THREE.Vector3(x,y,z).project(game));const xs=points.map(p=>(p.x+1)*w/2),ys=points.map(p=>(1-p.y)*h/2);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};});
  return {id:current.id,count:mount.aircraft,pose,viewport:[w,h],craftPixels:boxes};
 }
 window.fleetStudio=Object.freeze({ready:true,load,capture,blackout,planningFlight});status.textContent='Ready';
}catch(e){status.textContent=e.message;console.error(e);}
