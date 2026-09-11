import * as THREE from 'three';
import { GLTFLoader } from './vendor/three-r180/loaders/GLTFLoader.js';
import { BUDGETS, validateAssets, validateRegionMap, validateProjection, displayLayout, hexWorld, cameraPose } from './contract.js';
import { physicalMaterial, physicalMesh, validateScene } from './materials.js';
import { BOARD, buildTable } from './table.js';
import { SIZES, mm, validateScaleRows } from './scale.js';
import { preparePaintGeometry, candidatePaint, patchGeometry } from './hull-paint.js';
import { artProfile } from './hull-art.js';
import { clearInsert } from './clear-insert.js';
import {BASE_APEX,baseGeometry,postGeometry,standScaleRows} from './stands.js';
import {tabletopReflections} from './room-reflections.js';
import {maskInsertShadow,plasticMaterial,transmittingShadow} from './moulded-plastic.js';

const vertex = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
function normalizeHull(gltf, asset, regions) {
  const group=new THREE.Group();gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o=>{
    if(!o.isMesh)return;
    const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld).rotateY(asset.rotationY);
    const convert=mat=>physicalMaterial(asset.key+' / '+mat.name,{
      color:mat.map?'#ffffff':asset.colour,map:mat.map??null,
      roughness:.83,metalness:.025,flatShading:asset.faction==='VRA'
    });
    group.add(physicalMesh(asset.key+' / source geometry',geometry,Array.isArray(o.material)?o.material.map(convert):convert(o.material)));
  });
  const box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3()),scale=asset.length/size.x;
  for(const o of group.children)o.geometry.translate(-centre.x,-centre.y,-centre.z).scale(scale,scale,scale);
  if(asset.paint==='painted-1987')for(const o of group.children){
    const original=o.geometry;o.geometry=preparePaintGeometry(original,asset.faction);original.dispose();
    if(Object.values(o.geometry.userData.paint.paletteTriangles).some(n=>n===0))throw new Error('A source paint region disappeared from the candidate');
    o.material.dispose();o.material=candidatePaint(asset.faction,o.geometry);
  }
  group.updateMatrixWorld(true);
  const seat=(seed,kind)=>{
    const origin=new THREE.Vector3(...seed),dir=kind==='engine'?new THREE.Vector3(1,0,0):new THREE.Vector3(0,-1,0);
    if(kind==='engine')origin.x=-asset.length;else origin.y=asset.length;
    const hit=new THREE.Raycaster(origin,dir,0,asset.length*3).intersectObjects(group.children,false)[0];
    if(!hit)throw new Error('Unseated '+kind+' on '+asset.key);
    if(kind==='engine'&&hit.point.x>-asset.length*.35)throw new Error('Engine socket missed stern on '+asset.key);
    return hit.point.clone().addScaledVector(dir,-.018);
  };
  const underside=new THREE.Raycaster(new THREE.Vector3(asset.stand.attachment[0],-asset.length,asset.stand.attachment[2]),new THREE.Vector3(0,1,0),0,asset.length*2).intersectObjects(group.children,false)[0];
  if(!underside)throw new Error('Stand misses the actual underside of '+asset.key);
  if(underside.point.distanceTo(new THREE.Vector3(...asset.stand.attachment))>.003)throw new Error('Authored stand attachment is no longer seated on '+asset.key);
  return {group,size:size.multiplyScalar(scale),attachment:underside.point.clone(),sockets:{weapon:regions.features.beamEmitter?new THREE.Vector3(...regions.features.beamEmitter.socket):null,impact:seat(asset.sockets.impact,'impact'),engines:asset.sockets.engines.map(p=>seat(p,'engine'))},
    triangles:group.children.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0)};
}

export async function createTabletop(canvas, manifest, initial, {createRimStudy=null}={}) {
  validateAssets(manifest);validateProjection(initial);
  const context=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true});
  if(!context)throw new Error('WebGL2 is unavailable. Open the SVG Fleet Command fallback.');
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true});
  let transmissionAllocated=true;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.transmissionResolutionScale=.5; // Approved clear posts and crystals share the bounded transmission pass.
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.info.autoReset=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#6f5a42');
  const energyScene=new THREE.Scene();energyScene.userData.register='energetic';
  const key=new THREE.DirectionalLight('#ffe0ad',3.1);key.position.set(-25,65,30);key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-59,right:59,top:44,bottom:-44,near:1,far:150});
  key.shadow.mapSize.set(BUDGETS.shadowSize,BUDGETS.shadowSize);key.shadow.normalBias=.025;key.shadow.bias=-.00025;key.shadow.radius=2;
  scene.add(key);scene.add(new THREE.HemisphereLight('#d5deeb','#75614b',1.30));
  buildTable(scene);
  const reflection=tabletopReflections(renderer,scene);
  const camera=new THREE.PerspectiveCamera(32,1,1,250);
  const targetOptions={type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter};
  const physical=new THREE.WebGLRenderTarget(1,1,targetOptions);
  physical.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const energy=new THREE.WebGLRenderTarget(1,1,{...targetOptions,depthBuffer:false});
  const blurH=new THREE.WebGLRenderTarget(1,1,{...targetOptions,depthBuffer:false});
  const blurV=new THREE.WebGLRenderTarget(1,1,{...targetOptions,depthBuffer:false});
  const quadScene=new THREE.Scene(),quadCamera=new THREE.Camera();
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));quadScene.add(quad);quad.frustumCulled=false;
  const blurMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{image:{value:energy.texture},stepSize:{value:new THREE.Vector2()}},vertexShader:vertex,
    fragmentShader:`uniform sampler2D image;uniform vec2 stepSize;varying vec2 vUv;
void main(){vec4 c=texture2D(image,vUv)*.4;c+=texture2D(image,vUv+stepSize)*.24;c+=texture2D(image,vUv-stepSize)*.24;
c+=texture2D(image,vUv+stepSize*2.)*.06;c+=texture2D(image,vUv-stepSize*2.)*.06;gl_FragColor=c;}`});
  const composite=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{base:{value:physical.texture},energy:{value:energy.texture},bloom:{value:blurV.texture},depth:{value:physical.depthTexture},
    pixels:{value:new THREE.Vector2()},blur:{value:0},focus:{value:40},gain:{value:BUDGETS.bloomGain}},vertexShader:vertex,
    fragmentShader:`uniform sampler2D base,energy,bloom,depth;uniform vec2 pixels;uniform float blur,focus,gain;varying vec2 vUv;
float metres(float d){return 250.0/(250.0-d*249.0);}
void main(){float z=metres(texture2D(depth,vUv).r);float coc=clamp(abs(z-focus)/5.,0.,1.)*blur;
vec2 s=coc*pixels*.70710678;vec3 c=texture2D(base,vUv).rgb*.25;
c+=(texture2D(base,vUv+vec2(s.x,0)).rgb+texture2D(base,vUv-vec2(s.x,0)).rgb+texture2D(base,vUv+vec2(0,s.y)).rgb+texture2D(base,vUv-vec2(0,s.y)).rgb)*.125;
c+=(texture2D(base,vUv+s).rgb+texture2D(base,vUv-s).rgb+texture2D(base,vUv+vec2(s.x,-s.y)).rgb+texture2D(base,vUv+vec2(-s.x,s.y)).rgb)*.0625;
c+=texture2D(energy,vUv).rgb+min(texture2D(bloom,vUv).rgb*gain,vec3(.18));
gl_FragColor=vec4(c,1.);
#include <colorspace_fragment>
}`});
  const screen=material=>{quad.material=material;renderer.render(quadScene,quadCamera);};
  const energyUniforms=[];
  function energyMaterial(name,colour,style,strength) {
    const mat=new THREE.ShaderMaterial({name,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true,toneMapped:false,side:THREE.FrontSide,
      uniforms:{colour:{value:new THREE.Color(colour)},strength:{value:strength},style:{value:style},depthImage:{value:physical.depthTexture},resolution:{value:new THREE.Vector2(1,1)}},
      vertexShader:`varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying vec2 vUv;varying vec3 vN;varying vec3 vV;uniform sampler2D depthImage;uniform vec2 resolution;uniform vec3 colour;uniform float strength;uniform int style;
void main(){float front=texture2D(depthImage,gl_FragCoord.xy/resolution).r;if(gl_FragCoord.z>front+.000015)discard;
float a=1.;if(style==0){float r=length(vUv-.5)*2.;a=exp(-r*r*5.)*(1.-smoothstep(.6,1.,r));}
if(style==2)a=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.5);
if(style==3){float r=length(vUv-.5)*2.;a=(1.-smoothstep(.04,.12,abs(r-.68)))*.7;}
gl_FragColor=vec4(colour,min(strength,1.)*a);}`});
    mat.userData.register='energetic';energyUniforms.push(mat.uniforms);return mat;
  }
  const glowMaterial=energyMaterial('engine / no light or shadow','#f47b38',0,.15);
  const coreMaterial=energyMaterial('beam / additive core','#d9efff',1,.85);
  const haloMaterial=energyMaterial('beam / additive envelope','#689bc5',1,.22);
  const flareMaterial=energyMaterial('shield / additive grazing flare','#5ea9c9',2,.38);
  const anonymousMaterial=energyMaterial('anonymous / no directional information','#94b5bf',3,.42);
  const energyMesh=(name,g,m)=>{const o=new THREE.Mesh(g,m);o.name=name;o.userData.register='energetic';o.castShadow=o.receiveShadow=false;energyScene.add(o);return o;};
  const beamCore=energyMesh('beam core',new THREE.CylinderGeometry(.025,.025,1,8),coreMaterial);
  const beamHalo=energyMesh('beam halo',new THREE.CylinderGeometry(.085,.085,1,8),haloMaterial);
  const flare=energyMesh('own confirmed shield',new THREE.SphereGeometry(1,24,12),flareMaterial);
  const anonymous=energyMesh('unresolved origin',new THREE.PlaneGeometry(1,1),anonymousMaterial);
  for(const o of [beamCore,beamHalo,flare,anonymous])o.visible=false;

  const loaded=await Promise.all(manifest.assets.map(async asset=>{
    const [gltf,response]=await Promise.all([new GLTFLoader().loadAsync(asset.url),fetch(asset.regionMap)]);
    if(!response.ok)throw new Error('Missing authored region map');const regions=validateRegionMap(await response.json(),asset.faction);
    return {asset,regions,...normalizeHull(gltf,asset,regions)};
  }));
  const catalogue=new Map(loaded.map(a=>[a.asset.key,a]));
  for(const a of loaded)for(const o of a.group.children){o.material.envMap=reflection.texture;o.material.envMapIntensity=.6;maskInsertShadow(o);}
  const shard=loaded.find(a=>a.asset.faction==='VRA'),insert=clearInsert(shard.group.children[0].geometry,shard.regions);
  shard.group.add(insert);shard.group.children[0].material.userData.clearVariant.value=1;
  insert.material.envMap=reflection.texture;insert.material.envMapIntensity=.6;
  const baseMaterial=physicalMaterial('painted black hex bases',{color:'#151513',roughness:.86});
  const bases=new THREE.InstancedMesh(baseGeometry(),baseMaterial,initial.units.length);
  bases.name='bases / instanced';bases.userData.register='physical';bases.castShadow=bases.receiveShadow=true;scene.add(bases);
  const postMaterial=plasticMaterial({name:'approved clear moulded flight posts',post:true});postMaterial.envMap=reflection.texture;postMaterial.envMapIntensity=.6;
  const posts=new THREE.InstancedMesh(postGeometry(),postMaterial,initial.units.length);transmittingShadow(posts,.10);
  posts.name='posts / instanced and uniform';posts.userData.register='physical';posts.castShadow=posts.receiveShadow=true;scene.add(posts);
  scene.userData.scaleRows.push(...standScaleRows(bases.geometry,posts.geometry));
  // Opt-in measurement study only; the accepted board has no candidate markings.
  const rimStudy=createRimStudy?.(scene,initial.units);
  for(const a of loaded)scene.userData.scaleRows.push({object:a.asset.faction+' frigate',basis:'length; width/height in asset metrics',sceneUnits:[a.size.x],actualMm:[a.size.x*10],referenceMm:[SIZES.miniatures[a.asset.faction]]});
  validateScaleRows(scene.userData.scaleRows);
  const units=new Map(),glows=[],regionGlows=[],dummy=new THREE.Object3D();
  for(const u of initial.units){
    const asset=catalogue.get(`${u.faction}/${u.className}`);if(!asset)throw new Error(`No classified asset for ${u.faction}/${u.className}`);
    const model=asset.group;scene.add(model);
    const tether=physicalMesh(`${u.id} / shared-hex anchor tether`,new THREE.BoxGeometry(1,.012,.035),physicalMaterial('printed tether ink',{color:'#c9c3a2'}));scene.add(tether);tether.visible=false;
    const anchor=physicalMesh(`${u.id} / authoritative hex anchor`,new THREE.CylinderGeometry(.085,.085,.015,10),physicalMaterial('hex anchor ink',{color:'#cabf9b'}));scene.add(anchor);anchor.visible=false;
    const engines=asset.sockets.engines.map((socket,i)=>{const mesh=energyMesh(`${u.id} / engine ${i+1}`,new THREE.PlaneGeometry(.34,.34),glowMaterial);glows.push(mesh);return {socket,mesh};});
    const patches=[];
    if(asset.regions)for(const [kind,feature] of Object.entries(asset.regions.features)){
      const g=patchGeometry(model.children[0].geometry,feature.faces);
      g.computeBoundingBox();const expectedMin=new THREE.Vector3(...feature.min),expectedMax=new THREE.Vector3(...feature.max);
      if(g.boundingBox.min.distanceTo(expectedMin)>.003||g.boundingBox.max.distanceTo(expectedMax)>.003)throw new Error('Stale semantic face map: '+kind);
      const position=g.attributes.position,normal=g.attributes.normal;
      for(let i=0;i<position.count;i++)position.setXYZ(i,position.getX(i)+normal.getX(i)*.003,position.getY(i)+normal.getY(i)*.003,position.getZ(i)+normal.getZ(i)*.003);
      const mesh=energyMesh(u.id+' / exact '+kind+' colour patch',g,energyMaterial(u.id+' / confirmed '+kind,feature.colour,1,kind==='exhaust'?.16:.25));mesh.matrixAutoUpdate=false;
      patches.push({kind,mesh});regionGlows.push({id:u.id,kind,mesh});
    }
    units.set(u.id,{model,tether,anchor,engines,patches,asset,unit:u});
  }
  let packet=initial,layout=displayLayout(initial.units),pose=0,currentEffect=null,lastStats=null;
  function applyProjection(next) {
    validateProjection(next);if(!Object.isFrozen(next))throw new Error('Renderer requires a frozen projection');
    packet=next;layout=displayLayout(next.units);const present=new Set(next.units.map(u=>u.id));
    for(const [id,u] of units){u.model.visible=present.has(id);u.tether.visible=u.anchor.visible=false;for(const e of u.engines)e.mesh.visible=present.has(id)&&next.phase==='resolution';for(const p of u.patches)p.mesh.visible=present.has(id)&&next.phase==='resolution'&&p.kind==='exhaust';}
    bases.count=posts.count=next.units.length;
    next.units.forEach((u,i)=>{
      const entry=units.get(u.id);if(!entry)throw new Error('New hull requires an explicitly loaded asset');
      const p=layout[u.id],angle=u.facing*Math.PI/3;
      entry.unit=u;entry.model.position.set(p.x,BOARD.top+BASE_APEX+BUDGETS.postHeight,p.z);entry.model.rotation.y=angle;
      entry.model.position.y-=entry.asset.attachment.y;
      const attachment=new THREE.Vector3(entry.asset.attachment.x,0,entry.asset.attachment.z).applyAxisAngle(new THREE.Vector3(0,1,0),angle);
      entry.model.position.x-=attachment.x;entry.model.position.z-=attachment.z;
      entry.model.updateMatrixWorld(true);
      dummy.position.set(p.x,BOARD.top,p.z);dummy.rotation.set(0,angle,0);dummy.scale.set(p.baseScale,1,p.baseScale);dummy.updateMatrix();bases.setMatrixAt(i,dummy.matrix);
      dummy.position.y=BOARD.top+BASE_APEX+BUDGETS.postHeight/2;dummy.scale.set(1,1,1);dummy.updateMatrix();posts.setMatrixAt(i,dummy.matrix);
      if(p.baseScale<1){entry.anchor.visible=entry.tether.visible=true;entry.anchor.position.set(p.anchor.x,BOARD.top+.01,p.anchor.z);
        const dx=p.x-p.anchor.x,dz=p.z-p.anchor.z;entry.tether.position.set((p.x+p.anchor.x)/2,BOARD.top+.015,(p.z+p.anchor.z)/2);entry.tether.rotation.y=-Math.atan2(dz,dx);entry.tether.scale.x=Math.hypot(dx,dz);}
      for(const e of entry.engines)e.mesh.position.copy(entry.model.localToWorld(e.socket.clone()));
      for(const p of entry.patches)p.mesh.matrix.copy(entry.model.matrixWorld);
    });
    bases.instanceMatrix.needsUpdate=posts.instanceMatrix.needsUpdate=true;if(bases.instanceColor)bases.instanceColor.needsUpdate=true;
    bases.computeBoundingSphere();posts.computeBoundingSphere();
    rimStudy?.update(next.units,bases);
    renderer.shadowMap.needsUpdate=true;
  }
  function setCamera(progress) {
    pose=progress;const p=cameraPose(progress);camera.position.set(p.x,p.y,p.z);camera.fov=p.fov;camera.lookAt(0,p.targetY,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    composite.uniforms.blur.value=p.blur;composite.uniforms.focus.value=camera.position.distanceTo(new THREE.Vector3(0,4,0));
    for(const g of glows)g.quaternion.copy(camera.quaternion);anonymous.quaternion.copy(camera.quaternion);
  }
  const endpoint=(e,kind)=>{
    const u=units.get(e.id);if(!u||!u.model.visible)throw new Error('Effect endpoint is not visible');
    if(!u.asset.sockets[kind])throw new Error('No confirmed '+kind+' attachment for '+u.asset.asset.key);
    const p=hexWorld(e.hex),l=layout[e.id],point=u.model.localToWorld(u.asset.sockets[kind].clone());
    // If event-time coordinates differ, only explicitly supplied coordinates move the effect.
    point.x+=p.x-l.anchor.x;point.z+=p.z-l.anchor.z;
    if(point.y<BOARD.top+.4)throw new Error('Weapon endpoint intersects the board');return point;
  };
  function clearEffect(){for(const o of [beamCore,beamHalo,flare,anonymous])o.visible=false;for(const p of regionGlows)if(p.kind==='beamEmitter')p.mesh.visible=false;currentEffect=null;}
  function setEffect(event,progress) {
    if(event&&!packet.events.includes(event))throw new Error('Effect must belong to the current frozen projection');
    clearEffect();if(!event||progress>=1)return;currentEffect=event;
    const pulse=Math.sin(Math.PI*Math.max(.015,progress));
    if(event.kind==='beam'){
      for(const p of regionGlows)if(p.kind==='beamEmitter'&&p.id===event.source.id){p.mesh.visible=true;p.mesh.material.uniforms.strength.value=.25*pulse;}
      const from=endpoint(event.source,'weapon'),to=endpoint(event.destination,'impact'),delta=to.clone().sub(from);
      for(const mesh of [beamCore,beamHalo]){mesh.visible=true;mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.scale.y=delta.length();mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());}
      coreMaterial.uniforms.strength.value=.82*pulse;haloMaterial.uniforms.strength.value=.21*pulse;
    }else if(event.kind==='shield-flare'){
      const target=units.get(event.destination.id);flare.visible=true;flare.position.copy(target.model.position);flare.quaternion.copy(target.model.quaternion);
      flare.scale.set(target.asset.size.x*.56,target.asset.size.y*.85+.16,target.asset.size.z*.8+.15);flareMaterial.uniforms.strength.value=.48*pulse;
    }else if(event.kind==='anonymous'){
      anonymous.visible=true;anonymous.position.copy(endpoint(event.destination??event.source,'impact'));anonymous.scale.setScalar(1.1+progress*.6);anonymous.quaternion.copy(camera.quaternion);anonymousMaterial.uniforms.strength.value=.36*pulse;
    }
  }
  function resize() {
    const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,BUDGETS.pixelRatio,Math.sqrt(BUDGETS.maxPixels/Math.max(1,r.width*r.height)));
    const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
    renderer.setPixelRatio(1);renderer.setSize(w,h,false);physical.setSize(w,h);energy.setSize(w,h);blurH.setSize(Math.ceil(w*.5),Math.ceil(h*.5));blurV.setSize(Math.ceil(w*.5),Math.ceil(h*.5));
    camera.aspect=w/h;camera.updateProjectionMatrix();composite.uniforms.pixels.value.set(1/w,1/h);for(const u of energyUniforms)u.resolution.value.set(w,h);
  }
  function render({effects=true}={}) {
    renderer.info.reset();renderer.setRenderTarget(physical);renderer.setClearColor(scene.background,1);renderer.clear();renderer.render(scene,camera);
    renderer.shadowMap.autoUpdate=false;
    renderer.setRenderTarget(energy);renderer.setClearColor(0x000000,0);renderer.clear();if(effects)renderer.render(energyScene,camera);
    renderer.setRenderTarget(blurH);blurMaterial.uniforms.image.value=energy.texture;blurMaterial.uniforms.stepSize.value.set(2/energy.width,0);screen(blurMaterial);
    renderer.setRenderTarget(blurV);blurMaterial.uniforms.image.value=blurH.texture;blurMaterial.uniforms.stepSize.value.set(0,2/blurH.height);screen(blurMaterial);
    renderer.setRenderTarget(null);screen(composite);
    lastStats={drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,
      width:physical.width,height:physical.height,estimatedTargetMiB:(physical.width*physical.height*(24+(transmissionAllocated?15:0))+BUDGETS.shadowSize**2*4)/1048576,
      drawables:validateScene(scene)+validateScene(energyScene),actualCamera:{position:camera.position.toArray(),fov:camera.fov,pitch:Math.asin(-camera.getWorldDirection(new THREE.Vector3()).y)*180/Math.PI},camera:cameraPose(pose),activeEffect:currentEffect?.kind??null};
    return lastStats;
  }
  applyProjection(initial);setCamera(0);resize();render();
  if(lastStats.triangles>BUDGETS.maxTriangles||lastStats.drawCalls>BUDGETS.maxDrawCalls)throw new Error(`Slice budget exceeded: ${lastStats.triangles} triangles / ${lastStats.drawCalls} draws`);
  const textureSet=new Set();
  scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value?.isTexture)textureSet.add(value);if(m.userData.paintEdges)textureSet.add(m.userData.paintEdges);if(m.userData.opticalPlanes)textureSet.add(m.userData.opticalPlanes);}});
  const textureMiB=[...textureSet].reduce((n,t)=>n+(t.userData.byteLength??t.image.width*t.image.height*4*(t.generateMipmaps?4/3:1)),0)/1048576;
  if(textureMiB>BUDGETS.materialTextureMiB)throw new Error('Material texture budget exceeded: '+textureMiB+' MiB');
  const api={ applyProjection,setCamera,setEffect,clearEffect,resize,render,
    reviewHeading(heading){
      if(!Number.isInteger(heading)||heading<0||heading>5)throw Error('Six discrete review headings only');
      const next=Object.freeze({...initial,units:Object.freeze(initial.units.map(u=>Object.freeze({...u,facing:heading}))),events:Object.freeze([])});
      applyProjection(next);setCamera(0);clearEffect();render();
      const capture=api.physicalPixels(),metrics=[],rect=canvas.getBoundingClientRect(),g=bases.geometry,tri=g.userData.facingTriangle;
      const screen=p=>{const v=p.clone().project(camera);return {x:(v.x+1)*rect.width/2,y:(1-v.y)*rect.height/2};};
      const opaque=[];scene.traverse(o=>{if(o.isMesh&&o.visible&&!o.material.transmission)opaque.push(o);});
      initial.units.forEach((u,i)=>{
        const m=new THREE.Matrix4();bases.getMatrixAt(i,m);const corners=tri.corners.map(p=>new THREE.Vector3(...p).applyMatrix4(m)),pixels=corners.map(screen),samples=[];
        for(let a=1;a<10;a++)for(let b=1;b<10-a;b++){const p=corners[0].clone().multiplyScalar(a/10).addScaledVector(corners[1],b/10).addScaledVector(corners[2],1-(a+b)/10),direction=p.clone().sub(camera.position),distance=direction.length();
          const hit=new THREE.Raycaster(camera.position,direction.normalize()).intersectObjects(opaque,false).find(h=>h.object.visible);samples.push(!hit||hit.distance>=distance-.005);}
        const xs=pixels.map(p=>p.x),ys=pixels.map(p=>p.y),bounds={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
        metrics.push({id:u.id,heading,trianglePixels:pixels,bounds,unoccludedFraction:samples.filter(Boolean).length/samples.length,castReliefMm:tri.reliefMm});
      });
      g.setDrawRange(0,tri.castingStart);renderer.shadowMap.needsUpdate=true;render();const without=api.physicalPixels();g.setDrawRange(0,Infinity);renderer.shadowMap.needsUpdate=true;render();
      for(const r of metrics){let changed=0,maxDelta=0;const b=r.bounds,sx=physical.width/rect.width,sy=physical.height/rect.height;
        for(let y=Math.max(0,Math.floor((b.y-2)*sy));y<Math.min(physical.height,Math.ceil((b.y+b.height+2)*sy));y++)for(let x=Math.max(0,Math.floor((b.x-2)*sx));x<Math.min(physical.width,Math.ceil((b.x+b.width+2)*sx));x++){
          const index=((physical.height-1-y)*physical.width+x)*4;let delta=0;for(let k=0;k<3;k++)delta=Math.max(delta,Math.abs(THREE.DataUtils.fromHalfFloat(capture[index+k])-THREE.DataUtils.fromHalfFloat(without[index+k])));if(delta>.02)changed++;maxDelta=Math.max(maxDelta,delta);}
        r.changedBufferPixelsAbove002=changed;r.maxLinearDelta=maxDelta;r.bufferPixelsPerCssPixel=sx;
      }
      return {heading,triangles:metrics,rim:rimStudy?.measure(camera,canvas),camera:api.inspect().actualCamera,cssPixels:{width:rect.width,height:rect.height},bufferPixels:{width:physical.width,height:physical.height}};
    },
    measureRimStudy:()=>rimStudy?.measure(camera,canvas),
    measureRimTransit:()=>rimStudy?.transitSweep(camera,canvas),
    captureDetail(angle='plan',faction='KRE'){
      clearEffect();const hull=units.get(faction+'-FF-1');
      const positions={plan:[0,28,12],side:[4,26,30],stern:[-31,26,0],bow:[31,26,0]};
      if(!positions[angle])throw new Error('Unknown review angle');
      const offset=new THREE.Vector3(...positions[angle]).applyAxisAngle(new THREE.Vector3(0,1,0),hull.model.rotation.y);
      camera.position.set(hull.model.position.x+offset.x,positions[angle][1],hull.model.position.z+offset.z);camera.fov=14;
      camera.lookAt(hull.model.position);camera.updateProjectionMatrix();camera.updateMatrixWorld();composite.uniforms.blur.value=0;
      const direction=camera.getWorldDirection(new THREE.Vector3());if(camera.position.y<BUDGETS.cameraFloor||Math.asin(-direction.y)*180/Math.PI<BUDGETS.pitchFloor)throw new Error('Review camera crossed a floor');
      return render();
    },
    inspect:()=>({...lastStats,threeRevision:THREE.REVISION,clearVariant:insert.visible,visibleEnergyObjects:energyScene.children.filter(o=>o.isMesh&&o.visible).length,hullScreenBounds:Object.fromEntries([...units].map(([id,u])=>{
      const b=new THREE.Box3().setFromObject(u.model),points=[];
      for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(new THREE.Vector3(x,y,z).project(camera));
      const xs=points.map(p=>(p.x+1)*.5*physical.width),ys=points.map(p=>(1-p.y)*.5*physical.height);
      return [id,{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}];
    })),assets:loaded.map(a=>({key:a.asset.key,paint:a.asset.paint,triangles:a.triangles,paintEvidence:a.group.children[0].geometry.userData.paint??null,
      sizeMm:a.size.toArray().map(n=>n*10),standAttachment:a.attachment.toArray(),sockets:Object.fromEntries(Object.entries(a.sockets).map(([k,v])=>[k,Array.isArray(v)?v.map(p=>p.toArray()):v?.toArray()??null]))})),
      energyRegionGeometry:regionGlows.map(p=>({id:p.id,kind:p.kind,triangles:p.mesh.geometry.attributes.position.count/3})),materialTextureMiB:textureMiB,scaleMeasurements:scene.userData.scaleRows, postHeights:manifest.assets.map(a=>a.stand.height),
      mounting:[...units].map(([id,u],i)=>{const m=new THREE.Matrix4();posts.getMatrixAt(i,m);const bottom=new THREE.Vector3(0,-BUDGETS.postHeight/2,0).applyMatrix4(m),top=new THREE.Vector3(0,BUDGETS.postHeight/2,0).applyMatrix4(m),attachment=u.model.localToWorld(u.asset.attachment.clone());return {id,exposedMm:top.distanceTo(bottom)*10,baseGapMm:(bottom.y-BOARD.top-BASE_APEX)*10,hullGapMm:attachment.distanceTo(top)*10,opaque:posts.material.transmission===undefined&&posts.material.transparent===false,clear:posts.material.transmission===1};}),shadowLights:1,energyLights:energyScene.children.filter(o=>o.isLight).length}),
    brushEvidence(){
      // Each ablation changes one hull's albedo brush marks at the planning camera.
      // Count visible native-resolution pixels; this supports, not replaces, review.
      setCamera(0);clearEffect();render();const baseline=api.physicalPixels(),result={};
      for(const a of loaded){
        for(const o of a.group.children)if(o.material.userData.brush)o.material.userData.brush.value=0;
        render();const without=api.physicalPixels();let changed=0,maxDifference=0;
        for(let i=0;i<baseline.length;i+=4){let delta=0;for(let j=0;j<3;j++)delta=Math.max(delta,Math.abs(THREE.DataUtils.fromHalfFloat(baseline[i+j])-THREE.DataUtils.fromHalfFloat(without[i+j])));
          if(delta>.025)changed++;maxDifference=Math.max(maxDifference,delta);}
        result[a.asset.faction]={pixelsChangedAbove025:changed,maxLinearChannelDifference:maxDifference};
        for(const o of a.group.children)if(o.material.userData.brush)o.material.userData.brush.value=1;
      }
      render();return result;
    },
    regionEvidence(){
      setCamera(0);clearEffect();const result={};
      for(const a of loaded){
        for(const o of a.group.children)if(o.material.userData.audit)o.material.userData.audit.value=1;
        render();const pixels=api.physicalPixels(),palette=artProfile(a.asset.faction).palette,counts=Array(palette.length).fill(0);
        for(let i=0;i<pixels.length;i+=4){
          const g=THREE.DataUtils.fromHalfFloat(pixels[i+1]),b=THREE.DataUtils.fromHalfFloat(pixels[i+2]);
          if(g!==.9375||b!==.0625)continue;
          const id=Math.round(THREE.DataUtils.fromHalfFloat(pixels[i])*32)-1;if(id>=0&&id<counts.length)counts[id]++;
        }
        const total=counts.reduce((a,b)=>a+b,0);
        result[a.asset.faction]={totalPixels:total,regions:Object.fromEntries(palette.map((p,i)=>[p.key,{pixels:counts[i],visibleFraction:counts[i]/total,classification:p.classification}]))};
        for(const o of a.group.children)if(o.material.userData.audit)o.material.userData.audit.value=0;
      }
      render();return result;
    },
    setClearVariant(enabled){
      if(typeof enabled!=='boolean')throw Error('Clear variant requires explicit boolean');
      if(enabled)transmissionAllocated=true;
      insert.visible=enabled;shard.group.children[0].material.userData.clearVariant.value=enabled?1:0;
      renderer.shadowMap.needsUpdate=true;render();
      if(enabled&&(lastStats.triangles>BUDGETS.clearVariantTriangles||lastStats.drawCalls>BUDGETS.clearVariantDrawCalls||lastStats.estimatedTargetMiB>BUDGETS.clearVariantTargetMiB))throw Error('Clear comparison exceeds its separate budget');
      return {...insert.userData.evidence,enabled,drawCalls:lastStats.drawCalls,submittedTriangles:lastStats.triangles,estimatedTargetMiB:lastStats.estimatedTargetMiB,actualCamera:lastStats.actualCamera};
    },
    lightsOffEvidence(){
      const lights=scene.children.filter(o=>o.isLight).map(o=>[o,o.intensity]),background=scene.background;
      const environments=[];scene.traverse(o=>{if(o.isMesh&&o.material.envMap){environments.push([o.material,o.material.envMapIntensity]);o.material.envMapIntensity=0;}});
      for(const [light] of lights)light.intensity=0;scene.background=new THREE.Color(0);render();
      const pixels=new Uint16Array(physical.width*physical.height*4),glow=new Uint16Array(energy.width*energy.height*4);
      renderer.readRenderTargetPixels(physical,0,0,physical.width,physical.height,pixels);renderer.readRenderTargetPixels(energy,0,0,energy.width,energy.height,glow);
      const count=a=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]||a[i+1]||a[i+2])n++;return n;};
      const result={physicalNonzeroPixels:count(pixels),energeticNonzeroPixels:count(glow)};
      for(const [m,intensity] of environments)m.envMapIntensity=intensity;
      for(const [light,intensity] of lights)light.intensity=intensity;scene.background=background;render();return result;
    },
    // Read-only regression evidence from this isolated scene, never game state.
    physicalPixels:()=>{const out=new Uint16Array(physical.width*physical.height*4);renderer.readRenderTargetPixels(physical,0,0,physical.width,physical.height,out);return out;},
    shadowPixels:()=>{const target=key.shadow.map,out=new Uint8Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,out);return out;},
    depthEvidence:()=>{
      const saved=energyScene.children.map(o=>[o,o.visible]);for(const [o] of saved)o.visible=false;
      const probe=energyMesh('occlusion test probe',new THREE.PlaneGeometry(.8,.8),anonymousMaterial);probe.quaternion.copy(camera.quaternion);
      const read=()=>{render();const out=new Uint16Array(energy.width*energy.height*4);renderer.readRenderTargetPixels(energy,0,0,energy.width,energy.height,out);return out;};
      probe.position.set(0,BOARD.top-1,0);const behind=read();probe.position.y=BOARD.top+1;const front=read();
      energyScene.remove(probe);probe.geometry.dispose();for(const [o,visible] of saved)o.visible=visible;render();
      return {behindSamples:behind.filter(v=>v!==0).length,frontSamples:front.filter(v=>v!==0).length};
    },
    dispose:()=>{reflection.dispose();physical.dispose();energy.dispose();blurH.dispose();blurV.dispose();renderer.dispose();}
  };
  return api;
}
