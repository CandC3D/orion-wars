import * as THREE from 'three';
import {GLTFLoader} from '../vendor/three-r180/loaders/GLTFLoader.js';
import {buildTable} from '../table.js';
import {validateScene} from '../materials.js';
import {cameraPose,hexWorld,validateRegionMap} from '../contract.js';
import {factionRegion} from '../faction-palettes.js';
import {preparePaintGeometry,candidatePaint} from '../hull-paint.js';
import {tabletopReflections} from '../room-reflections.js';
import {mountFleetHull} from '../fleet-mount.js';
import {validateFleetManifest,fleetHull} from '../fleet-contract.js';
import {createPlayback} from '../../contact-playback.js';
import {validateReel} from './projection.js';
import {pipeline} from './pipeline.js';
import {createEffects} from './effects.js';
const get=p=>fetch(p).then(r=>{if(!r.ok)throw Error('Missing '+p);return r.json();});
try{
 const packet=validateReel(await get('./scenario.json')),attachments=await get('./attachments.json'),manifest=validateFleetManifest(await get('../fleet-assets.json')),inventory=await get('../prepared/fleet/inventory.json');
 const w=1920,h=1080,renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});renderer.setSize(w,h,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.transmissionResolutionScale=.5;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.info.autoReset=false;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#6f5a42');const energy=new THREE.Scene();energy.userData.register='energetic';
 const key=new THREE.DirectionalLight('#ffe0ad',3.1);key.position.set(-25,65,30);key.castShadow=true;Object.assign(key.shadow.camera,{left:-59,right:59,top:44,bottom:-44,near:1,far:150});key.shadow.mapSize.set(2048,2048);key.shadow.normalBias=.025;key.shadow.bias=-.00025;scene.add(key,new THREE.HemisphereLight('#d5deeb','#75614b',1.3));buildTable(scene);
 const reflection=tabletopReflections(renderer,scene),camera=new THREE.PerspectiveCamera(12.7,w/h,1,250),post=pipeline(renderer,w,h),fx=createEffects(energy,camera,post.physical.depthTexture,w,h),units=new Map();
 for(const u of packet.units){
  const entry=fleetHull(manifest,u.asset),record=inventory.hulls.find(h=>h.id===u.asset),[gltf,regions]=await Promise.all([new GLTFLoader().loadAsync('../prepared/fleet/'+u.asset+'.glb'),get('../prepared/fleet/'+u.asset+'-regions.json')]);
  const palette=Object.keys(record.regions).map(k=>factionRegion(u.faction,k)),map=validateRegionMap(regions,u.faction,{palette,confirmedEffects:entry.pointDefence?['pointDefenceEmitter']:[]});
  gltf.scene.updateMatrixWorld(true);const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});if(meshes.length!==1)throw Error('Unexpected prepared mesh');
  const src=meshes[0],raw=src.geometry.clone().applyMatrix4(src.matrixWorld),geo=preparePaintGeometry(raw,u.faction,palette),paint=candidatePaint(u.faction,geo);paint.envMap=reflection.texture;paint.envMapIntensity=.6;
  const mount=mountFleetHull(entry,geo,paint,map,reflection.texture);scene.add(mount.group);units.set(u.id,{...u,mount,entry,sockets:attachments.units[u.asset].sockets});
 }
 const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);},phase=(t,a,b)=>THREE.MathUtils.clamp((t-a)/(b-a),0,1);
 function place(t){for(const u of units.values()){
  const a=u.poses[0],b=u.poses[1],c=u.poses[2],p=smooth(phase(t,4.2,7.2)),turn=smooth(phase(t,8,10.6)),world=hexWorld({q:THREE.MathUtils.lerp(a.q,b.q,p),r:THREE.MathUtils.lerp(a.r,b.r,p)});
  const delta=((c.facing-b.facing+9)%6)-3;u.mount.group.position.set(world.x,0,world.z);u.mount.group.rotation.y=(a.facing+delta*turn)*Math.PI/3;u.mount.group.updateMatrixWorld(true);
 }}
 function socket(id,kind){const u=units.get(id),p=u.mount.hulls.children[0].localToWorld(new THREE.Vector3(...u.sockets[kind].socket));if(p.y<.6)throw Error('Muzzle below board');return p;}
 function impact(id,from){const u=units.get(id),hull=u.mount.hulls.children[0],box=new THREE.Box3().setFromObject(hull),centre=box.getCenter(new THREE.Vector3());
  // Actual surface intersection; aim above the midline so the contact is visible
  // and still lies on source geometry. No floating target or board strike.
  const size=box.getSize(new THREE.Vector3());centre.y+=size.y*.22;
  let ray,hit;for(const offset of [.28,.18,.1,0]){const aim=centre.clone();aim.z+=size.z*offset;ray=new THREE.Raycaster(from,aim.sub(from).normalize());hit=ray.intersectObject(hull,true)[0];if(hit)break;}if(!hit)throw Error('Target hull not intersected');
  return {point:hit.point.clone().addScaledVector(ray.ray.direction,-.014),normal:hit.face.normal.clone().transformDirection(hit.object.matrixWorld)};
 }
 const beams=packet.events.filter(e=>e.kind==='beam').map((e,i)=>({...e,start:[12,15.5,15.68,19][i],end:[14.8,18.3,18.48,21.8][i]}));
 const missiles=packet.events.filter(e=>e.kind==='launch').map((e,i)=>({...e,index:i,start:[14.2,17.5,21][i],end:[28,30.7,33.2][i],course:packet.projectiles.find(p=>p.id===e.missileId),impact:packet.events.find(p=>p.kind==='missile'&&p.missileId===e.missileId)}));
 function flight(m,t){const from=socket(m.source,'missile'),to=impact(m.target,from).point,world=hexWorld(m.course.midpoint),mid=new THREE.Vector3(world.x,THREE.MathUtils.lerp(from.y,to.y,.5),world.z);
  return t<24.5?from.lerp(mid,phase(t,m.start,24.5)):mid.lerp(to,phase(t,24.5,m.end));
 }
 let now=0,lastTime=0,cameraOverride=null,stats=null;
 function render(t,{effects=true,planning=false}={}){
  lastTime=t;place(t);const progress=planning?0:cameraOverride??(t<34.8?phase(t,3,4.2):1-phase(t,34.8,36));const pose=cameraPose(progress);camera.position.set(pose.x,pose.y,pose.z);camera.fov=pose.fov;camera.lookAt(0,pose.targetY,0);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);post.composite.uniforms.blur.value=pose.blur;post.composite.uniforms.focus.value=camera.position.distanceTo(new THREE.Vector3(0,4.6,0));
  post.composite.uniforms.inverseVP.value.multiplyMatrices(camera.matrixWorld,camera.projectionMatrixInverse);
  fx.clear(t);const active=[],endpoints=[];
  beams.forEach((e,i)=>{const age=t-e.start;if(age>=0&&t<e.end){const a=socket(e.source,'beam'+e.mount),hit=impact(e.target,a),strength=Math.min(1,age/.12,(e.end-t)/.18);fx.beam(i,a,hit.point,units.get(e.source).faction,strength);active.push(e.weapon);endpoints.push({kind:'beam',source:a.toArray(),target:hit.point.toArray()});
    if(e.absorbed>0)fx.shield(i,hit.point,hit.normal,Math.min(.85,age/3.5));
    if(age<1.4)fx.burst(i,hit.point,age/1.4,.45);
  }});
  missiles.forEach((m,i)=>{if(t>=m.start&&t<m.end){const p=flight(m,t),prior=flight(m,Math.max(m.start,t-.75));fx.projectile(i,p,prior,units.get(m.source).faction,t);active.push(m.weapon);endpoints.push({kind:'projectile',position:p.toArray()});
    const left=m.end-t;if(left<2.1&&left>1.25){m.impact.defenders.forEach((id,j)=>{const a=socket(id,'pd'),miss=p.clone().add(new THREE.Vector3(.08,.24+.1*j,.23));fx.beam(4+j,a,miss,units.get(id).faction,.43,.065);active.push('pooled point defence / failed');});}
   }if(t>=m.end&&t<m.end+1.4){const hit=impact(m.target,socket(m.source,'missile'));fx.burst(4+i,hit.point,(t-m.end)/1.4);active.push('hit explosion');}
  });
  document.querySelector('#phase').textContent=t<3?'Orders · advance, turn, fire':t<4.2?'Resolution':t<8?'Turn 1 · Round 1 · advance':t<10.6?'Turn 1 · Round 2 · turn':t<12?'Turn 1 · Round 3 · fire':t<15.5?'Victory · laser cannon / neutronic missile':t<19?'Swift · blaster beams / plasma torpedo':t<24.5?'Point · heavy blaster / neutronic missile':t<34.8?'Turn 2 · incoming weapons / point defence': 'Three ships remain · end of exchange';
  post.render(scene,energy,camera,effects);validateScene(scene);validateScene(energy);
  const pitch=Math.asin(-camera.getWorldDirection(new THREE.Vector3()).y)*180/Math.PI;if(pose.y<24||pitch<32)throw Error('Camera floor');
  stats={time:t,active,camera:{...pose,pitch},draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,targetMiB:(w*h*39+2048**2*4)/1048576,endpoints,ships:[...units.values()].map(u=>{const b=new THREE.Box3().setFromObject(u.mount.group),pts=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])pts.push(new THREE.Vector3(x,y,z).project(camera));return {id:u.id,clip:pts.map(p=>p.toArray())};})};return stats;
 }
 const pending=[],clock=createPlayback({now:()=>now,raf:fn=>pending.push(fn)});
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 async function start(){clock.cancel();pending.length=0;now=0;clock.run([{events:[{kind:'reel'}]}],{durationFor:()=>packet.durationMs,onTick:(_,p)=>render(p*38)});await flush();}
 async function step(ms){if(ms<now)await start();now=ms;const callbacks=pending.splice(0);callbacks.forEach(f=>f(ms));await flush();if(Math.abs(lastTime-ms/1000)>.0001)throw Error('Playback clock did not render requested frame');return stats;}
 const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b.buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
 async function isolation(t){render(t,{effects:false});const a=await hash(post.pixels()),shadow=()=>{const rt=key.shadow.map,b=new Uint8Array(rt.width*rt.height*4);renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,b);return b;};const sa=await hash(shadow());render(t);const b=await hash(post.pixels()),sb=await hash(shadow());return {physicalBefore:a,physicalAfter:b,shadowBefore:sa,shadowAfter:sb,identical:a===b&&sa===sb,energeticLights:energy.children.filter(o=>o.isLight).length};}
 function measure(t){render(t,{planning:true});const active=fx.all.filter(m=>m.visible),rows=[];
  for(const m of active.filter(m=>/continuous beam [0-3]$|projectile [0-2]$|confirmed struck|hit flash/.test(m.name))){
   active.forEach(o=>o.visible=o===m);post.render(scene,energy,camera);const b=post.pixels(post.energy);let x0=w,y0=h,x1=-1,y1=-1,pixels=0;
   for(let i=0;i<b.length;i+=4){if(Math.max(THREE.DataUtils.fromHalfFloat(b[i]),THREE.DataUtils.fromHalfFloat(b[i+1]),THREE.DataUtils.fromHalfFloat(b[i+2]))<.05)continue;const p=i/4,x=p%w,y=Math.floor(p/w);x0=Math.min(x,x0);x1=Math.max(x,x1);y0=Math.min(y,y0);y1=Math.max(y,y1);pixels++;}
   rows.push({effect:m.name,thresholdLinear:.05,pixels,bounds:pixels?{x:x0,y:h-1-y1,width:x1-x0+1,height:y1-y0+1}:null});
  }render(t);return {time:t,planning:true,effects:rows};
 }
 window.reel=Object.freeze({ready:true,start,step,inspect:(t,planning=false)=>render(t,{planning}),isolation,measure,stats:()=>stats,packet});await start();
}catch(e){document.querySelector('#phase').textContent=e.message;console.error(e);window.reelError=e.stack;}
