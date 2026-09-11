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
import {timeline,DURATION} from './timeline.js';
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
  const a=u.poses[0],b=u.poses[1],p=smooth(phase(t,4.4,5.9)),turn=smooth(phase(t,3.5,4.4)),world=hexWorld({q:THREE.MathUtils.lerp(a.q,b.q,p),r:THREE.MathUtils.lerp(a.r,b.r,p)});
  const delta=((b.facing-a.facing+9)%6)-3;u.mount.group.position.set(world.x,0,world.z);u.mount.group.rotation.y=(a.facing+delta*turn)*Math.PI/3;u.mount.group.updateMatrixWorld(true);
 }}
 function socket(id,kind){const u=units.get(id),p=u.mount.hulls.children[0].localToWorld(new THREE.Vector3(...u.sockets[kind].socket));if(p.y<.6)throw Error('Muzzle below board');return p;}
 function impact(id,from){const u=units.get(id),hull=u.mount.hulls.children[0],box=new THREE.Box3().setFromObject(hull),centre=box.getCenter(new THREE.Vector3());
  // Actual surface intersection; aim above the midline so the contact is visible
  // and still lies on source geometry. No floating target or board strike.
  const size=box.getSize(new THREE.Vector3());centre.y+=size.y*.22;
  let ray,hit;for(const offset of [.28,.18,.1,0]){const aim=centre.clone();aim.z+=size.z*offset;ray=new THREE.Raycaster(from,aim.sub(from).normalize());hit=ray.intersectObject(hull,true)[0];if(hit)break;}if(!hit)throw Error('Target hull not intersected');
  return {point:hit.point.clone().addScaledVector(ray.ray.direction,-.014),normal:hit.face.normal.clone().transformDirection(hit.object.matrixWorld)};
 }
 const {beams,missiles}=timeline(packet);
 function flight(m,t){const from=socket(m.source,'missile'),to=impact(m.target,from).point,world=hexWorld(m.course.midpoint),mid=new THREE.Vector3(world.x,THREE.MathUtils.lerp(from.y,to.y,.5),world.z);
  // The rules decide next-turn interception; a one-hex standoff illustrates it.
  // This distance never enters the simulation or claims a new collision rule.
  if(m.impact.intercepted)to.addScaledVector(from.clone().sub(to).normalize(),3.2);
  const firstHex=hexWorld(m.course.samples[0]),first=new THREE.Vector3(firstHex.x,THREE.MathUtils.lerp(from.y,to.y,1/3),firstHex.z);
  return t<16.4?from.lerp(first,phase(t,m.start,16.4)):t<20?first.lerp(mid,phase(t,16.4,20)):mid.lerp(to,phase(t,20,m.end));
 }
 let now=0,lastTime=0,cameraOverride=null,stats=null;
 function shipBounds(u){
  // Project rendered vertices, not the empty corners of a rotated world AABB.
  // The latter falsely clips long ships during a turn while the mesh is inside.
  const vp=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),p=new THREE.Vector3();let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  u.mount.group.traverseVisible(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position,m=new THREE.Matrix4().multiplyMatrices(vp,o.matrixWorld);for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(m);x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}});
  return {id:u.id,clip:[[x0,y0],[x1,y1]]};
 }
 function render(t,{effects=true,planning=false}={}){
  lastTime=t;place(t);const progress=planning?0:cameraOverride??(t<29?phase(t,2.5,3.5):1-phase(t,29,30));const pose=cameraPose(progress);camera.position.set(pose.x,pose.y,pose.z);camera.fov=pose.fov;camera.lookAt(0,pose.targetY,0);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);post.composite.uniforms.blur.value=pose.blur;post.composite.uniforms.focus.value=camera.position.distanceTo(new THREE.Vector3(0,4.6,0));
  post.composite.uniforms.inverseVP.value.multiplyMatrices(camera.matrixWorld,camera.projectionMatrixInverse);
  fx.clear(t);const active=[],endpoints=[];
  beams.forEach((e,i)=>{const age=t-e.start;if(age>=0&&t<e.end){const a=socket(e.source,'beam'+e.mount),hit=impact(e.target,a),strength=Math.min(1,(age+1/30)/.1,(e.end-t)/.15);fx.beam(i,a,hit.point,units.get(e.source).faction,strength);active.push(e.weapon);endpoints.push({kind:'beam',source:a.toArray(),target:hit.point.toArray()});
    if(e.absorbed>0)fx.shield(i,hit.point,hit.normal,Math.min(.85,age/3.5));
    if(age<1.4)fx.burst(i,hit.point,age/1.4,.45);
  }});
  missiles.forEach((m,i)=>{if(t>=m.start&&t<m.end){const p=flight(m,t),prior=flight(m,Math.max(m.start,t-.75));fx.projectile(i,p,prior,units.get(m.source).faction,t,m.weapon==='plasma-torpedo');active.push(m.weapon);endpoints.push({kind:'projectile',position:p.toArray()});
    for(let j=0;j<4;j++){const start=m.end-1+j*.2,age=t-start;if(age>=-1e-9&&age<.4){const a=socket(m.target,'pd'),b=flight(m,Math.min(m.end,start+.4));if(!m.impact.intercepted)b.y+=.6;fx.tracer(i*4+j,a,b,Math.min(1,(age+1/30)/.4),units.get(m.target).faction);active.push('point defence tracer');}}
   }if(t>=m.end&&t<m.end+1.1666667){const hit=impact(m.target,socket(m.source,'missile')),p=m.impact.intercepted?flight(m,m.end):hit.point;fx.burst(5+i,p,(t-m.end)/1.1666667,m.impact.intercepted?.7:.95);if(m.impact.absorbed)fx.shield(5+i,hit.point,hit.normal,(t-m.end)/1.1666667);active.push(m.impact.intercepted?'projectile intercepted':'hit explosion');endpoints.push({kind:m.impact.intercepted?'interception':'impact',position:p.toArray()});}
  });
  document.querySelector('#phase').textContent=t<2.5?'Orders':t<3.5?'Resolution':t<6.6?'Turn 1 · Round 1 · turn and advance':t<9.9?'Swift fires on Point':t<13.2?'Victory fires on Point and Swift':t<16.4?'Point fires on Victory':t<20?'Turn 1 · Round 3':t<24.3?'Turn 2 · incoming fire':t<25.3?'Point intercepts the plasma torpedo':t<27.5?'Victory’s missile hits Point':t<29?'Victory intercepts the return missile':'Three ships remain';
  post.render(scene,energy,camera,effects);validateScene(scene);validateScene(energy);
  const pitch=Math.asin(-camera.getWorldDirection(new THREE.Vector3()).y)*180/Math.PI;if(pose.y<24||pitch<32)throw Error('Camera floor');
  stats={time:t,active,camera:{...pose,pitch},draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,targetMiB:(w*h*39+2048**2*4)/1048576,endpoints,ships:[...units.values()].map(shipBounds)};return stats;
 }
 const pending=[],clock=createPlayback({now:()=>now,raf:fn=>pending.push(fn)});
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 async function start(){clock.cancel();pending.length=0;now=0;clock.run([{events:[{kind:'reel'}]}],{durationFor:()=>packet.durationMs,onTick:(_,p)=>render(p*DURATION)});await flush();}
 async function step(ms){if(ms<now)await start();now=ms;const callbacks=pending.splice(0);callbacks.forEach(f=>f(ms));await flush();if(Math.abs(lastTime-ms/1000)>.0001)throw Error('Playback clock did not render requested frame');return stats;}
 const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b.buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
 async function isolation(t){render(t,{effects:false});const a=await hash(post.pixels()),shadow=()=>{const rt=key.shadow.map,b=new Uint8Array(rt.width*rt.height*4);renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,b);return b;};const sa=await hash(shadow());render(t);const b=await hash(post.pixels()),sb=await hash(shadow());return {physicalBefore:a,physicalAfter:b,shadowBefore:sa,shadowAfter:sb,identical:a===b&&sa===sb,energeticLights:energy.children.filter(o=>o.isLight).length};}
 function measure(t,planning=true){render(t,{planning});const active=fx.all.filter(m=>m.visible),rows=[];
  for(const m of active.filter(m=>/continuous beam|projectile [0-2]$|confirmed struck|hit flash|PD tracer/.test(m.name))){
   active.forEach(o=>o.visible=o===m);post.render(scene,energy,camera);const b=post.pixels(post.energy);let x0=w,y0=h,x1=-1,y1=-1,pixels=0;
   for(let i=0;i<b.length;i+=4){if(Math.max(THREE.DataUtils.fromHalfFloat(b[i]),THREE.DataUtils.fromHalfFloat(b[i+1]),THREE.DataUtils.fromHalfFloat(b[i+2]))<.05)continue;const p=i/4,x=p%w,y=Math.floor(p/w);x0=Math.min(x,x0);x1=Math.max(x,x1);y0=Math.min(y,y0);y1=Math.max(y,y1);pixels++;}
   rows.push({effect:m.name,thresholdLinear:.05,pixels,bounds:pixels?{x:x0,y:h-1-y1,width:x1-x0+1,height:y1-y0+1}:null});
  }render(t);return {time:t,planning,effects:rows};
 }
 window.reel=Object.freeze({ready:true,start,step,inspect:(t,planning=false)=>render(t,{planning}),isolation,measure,stats:()=>stats,packet});await start();
}catch(e){document.querySelector('#phase').textContent=e.message;console.error(e);window.reelError=e.stack;}
