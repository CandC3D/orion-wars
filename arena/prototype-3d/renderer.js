import * as THREE from 'three';
import { GLTFLoader } from './vendor/three-r180/loaders/GLTFLoader.js';
import { BUDGETS, validateAssets, validateProjection, displayLayout, hexWorld, cameraPose } from './contract.js';
import { physicalMaterial, physicalMesh, validateScene, candidatePaint, canvasTexture } from './materials.js';
import { BOARD, buildTable } from './table.js';

const vertex = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const labelTexture = (faction, colour) => canvasTexture(256,256,c=>{
  c.fillStyle=colour;c.fillRect(0,0,256,256);c.fillStyle='#d8cdb0';c.textAlign='center';
  c.font='bold 29px monospace';c.fillText(`${faction} / FF`,128,207);
  c.beginPath();c.moveTo(207,111);c.lineTo(175,95);c.lineTo(175,127);c.closePath();c.fill();
  c.strokeStyle='#c3bc9f';c.lineWidth=3;c.beginPath();c.arc(128,128,104,0,Math.PI*2);c.stroke();
});

function normalizeHull(gltf, asset) {
  const group = new THREE.Group(), discard = new Set();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    // Original geometry stays intact. Bake the existing node transform into a runtime clone.
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld).rotateY(-Math.PI/2);
    group.add(physicalMesh(`${asset.key} / painted white metal`,geometry,physicalMaterial('temporary classified basecoat')));
    for (const mat of Array.isArray(o.material)?o.material:[o.material]) {
      for (const value of Object.values(mat)) if(value?.isTexture) discard.add(value);
      discard.add(mat);
    }
    discard.add(o.geometry);
  });
  const box = new THREE.Box3().setFromObject(group), size=box.getSize(new THREE.Vector3()), centre=box.getCenter(new THREE.Vector3());
  const scale=asset.length/size.x;
  const material=asset.paint==='candidate-1987'?candidatePaint(size.clone().multiplyScalar(scale)):
    physicalMaterial(`${asset.key} / reference basecoat only`,{color:asset.colour,roughness:.83,metalness:.025,flatShading:asset.faction==='VRA'});
  group.traverse(o=>{if(o.isMesh){o.geometry.translate(-centre.x,-centre.y,-centre.z).scale(scale,scale,scale);o.material.dispose();o.material=material;}});
  for(const value of discard)value.dispose();
  group.updateMatrixWorld(true);
  const meshes=group.children;
  const seat=(seed,kind)=>{
    const origin=new THREE.Vector3(...seed),dir=kind==='engine'?new THREE.Vector3(1,0,0):new THREE.Vector3(0,-1,0);
    if(kind==='engine')origin.x=-asset.length;else origin.y=asset.length;
    const hit=new THREE.Raycaster(origin,dir,0,asset.length*3).intersectObjects(meshes,false)[0];
    if(!hit)throw new Error(`Unseated ${kind} socket on ${asset.key}; asset owner must author it`);
    if(kind==='engine'&&hit.point.x>-asset.length*.35)throw new Error(`Engine socket missed the stern on ${asset.key}`);
    return hit.point.clone().addScaledVector(dir,-.018);
  };
  return { group, size:size.multiplyScalar(scale), sockets:{ weapon:seat(asset.sockets.weapon,'weapon'), impact:seat(asset.sockets.impact,'impact'),
    engines:asset.sockets.engines.map(p=>seat(p,'engine')) }, triangles:meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0) };
}

export async function createTabletop(canvas, manifest, initial) {
  validateAssets(manifest);validateProjection(initial);
  const context=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true});
  if(!context)throw new Error('WebGL2 is unavailable. Open the SVG Fleet Command fallback.');
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.info.autoReset=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#6f5a42');
  const energyScene=new THREE.Scene();energyScene.userData.register='energetic';
  const key=new THREE.DirectionalLight('#ffe0ad',3.1);key.position.set(-8,21,11);key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-20,right:20,top:18,bottom:-18,near:1,far:60});
  key.shadow.mapSize.set(BUDGETS.shadowSize,BUDGETS.shadowSize);key.shadow.normalBias=.025;key.shadow.bias=-.00025;key.shadow.radius=2;
  scene.add(key);scene.add(new THREE.HemisphereLight('#d5deeb','#75614b',1.30));
  buildTable(scene);
  const camera=new THREE.PerspectiveCamera(32,1,.1,160);
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
float metres(float d){return 16.0/(160.0-d*159.9);}
void main(){float z=metres(texture2D(depth,vUv).r);float coc=clamp(abs(z-focus)/8.,0.,1.)*blur;
vec2 s=coc*pixels;vec3 c=texture2D(base,vUv).rgb*.4;
c+=(texture2D(base,vUv+vec2(s.x,0)).rgb+texture2D(base,vUv-vec2(s.x,0)).rgb+texture2D(base,vUv+vec2(0,s.y)).rgb+texture2D(base,vUv-vec2(0,s.y)).rgb)*.15;
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

  const loaded=await Promise.all(manifest.assets.map(async asset=>({asset,...normalizeHull(await new GLTFLoader().loadAsync(asset.url),asset)})));
  const catalogue=new Map(loaded.map(a=>[a.asset.key,a]));
  const baseMaterial=physicalMaterial('faction-painted hex bases',{color:'#ffffff',roughness:.81});
  const bases=new THREE.InstancedMesh(new THREE.CylinderGeometry(1.16,1.24,.25,6),baseMaterial,initial.units.length);
  bases.name='bases / instanced';bases.userData.register='physical';bases.castShadow=bases.receiveShadow=true;scene.add(bases);
  const posts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.065,.074,BUDGETS.postHeight,10),physicalMaterial('neutral flight posts',{color:'#aaa999',roughness:.53,metalness:.2}),initial.units.length);
  posts.name='posts / instanced and uniform';posts.userData.register='physical';posts.castShadow=posts.receiveShadow=true;scene.add(posts);
  const units=new Map(),glows=[],dummy=new THREE.Object3D();
  for(const u of initial.units){
    const asset=catalogue.get(`${u.faction}/${u.className}`);if(!asset)throw new Error(`No classified asset for ${u.faction}/${u.className}`);
    const model=asset.group;scene.add(model);
    const label=physicalMesh(`${u.id} / class and heading on base`,new THREE.CircleGeometry(1.06,6),physicalMaterial(`${u.faction} base printing`,{map:labelTexture(u.faction,asset.asset.baseColour),roughness:.89}));label.rotation.x=-Math.PI/2;scene.add(label);
    const tether=physicalMesh(`${u.id} / shared-hex anchor tether`,new THREE.BoxGeometry(1,.012,.035),physicalMaterial('printed tether ink',{color:'#c9c3a2'}));scene.add(tether);tether.visible=false;
    const anchor=physicalMesh(`${u.id} / authoritative hex anchor`,new THREE.CylinderGeometry(.085,.085,.015,10),physicalMaterial('hex anchor ink',{color:'#cabf9b'}));scene.add(anchor);anchor.visible=false;
    const engines=asset.sockets.engines.map((socket,i)=>{const mesh=energyMesh(`${u.id} / engine ${i+1}`,new THREE.PlaneGeometry(.34,.34),glowMaterial);glows.push(mesh);return {socket,mesh};});
    units.set(u.id,{model,label,tether,anchor,engines,asset,unit:u});
  }
  let packet=initial,layout=displayLayout(initial.units),pose=0,currentEffect=null,lastStats=null;
  function applyProjection(next) {
    validateProjection(next);if(!Object.isFrozen(next))throw new Error('Renderer requires a frozen projection');
    packet=next;layout=displayLayout(next.units);const present=new Set(next.units.map(u=>u.id));
    for(const [id,u] of units){u.model.visible=u.label.visible=present.has(id);u.tether.visible=u.anchor.visible=false;for(const e of u.engines)e.mesh.visible=present.has(id);}
    bases.count=posts.count=next.units.length;
    next.units.forEach((u,i)=>{
      const entry=units.get(u.id);if(!entry)throw new Error('New hull requires an explicitly loaded asset');
      const p=layout[u.id],angle=u.facing*Math.PI/3;
      entry.unit=u;entry.model.position.set(p.x,BOARD.top+.25+BUDGETS.postHeight,p.z);entry.model.rotation.y=angle;
      entry.model.position.y-=entry.asset.asset.stand.attachment[1];
      const attachment=new THREE.Vector3(entry.asset.asset.stand.attachment[0],0,entry.asset.asset.stand.attachment[2]).applyAxisAngle(new THREE.Vector3(0,1,0),angle);
      entry.model.position.x-=attachment.x;entry.model.position.z-=attachment.z;
      entry.model.updateMatrixWorld(true);
      entry.label.position.set(p.x,BOARD.top+.253,p.z);entry.label.rotation.z=angle;entry.label.scale.setScalar(p.baseScale);
      dummy.position.set(p.x,BOARD.top+.125,p.z);dummy.rotation.set(0,angle,0);dummy.scale.set(p.baseScale,1,p.baseScale);dummy.updateMatrix();bases.setMatrixAt(i,dummy.matrix);bases.setColorAt(i,new THREE.Color(entry.asset.asset.baseColour));
      dummy.position.y=BOARD.top+.25+BUDGETS.postHeight/2;dummy.scale.set(1,1,1);dummy.updateMatrix();posts.setMatrixAt(i,dummy.matrix);
      if(p.baseScale<1){entry.anchor.visible=entry.tether.visible=true;entry.anchor.position.set(p.anchor.x,BOARD.top+.01,p.anchor.z);
        const dx=p.x-p.anchor.x,dz=p.z-p.anchor.z;entry.tether.position.set((p.x+p.anchor.x)/2,BOARD.top+.015,(p.z+p.anchor.z)/2);entry.tether.rotation.y=-Math.atan2(dz,dx);entry.tether.scale.x=Math.hypot(dx,dz);}
      for(const e of entry.engines)e.mesh.position.copy(entry.model.localToWorld(e.socket.clone()));
    });
    bases.instanceMatrix.needsUpdate=posts.instanceMatrix.needsUpdate=true;if(bases.instanceColor)bases.instanceColor.needsUpdate=true;
    bases.computeBoundingSphere();posts.computeBoundingSphere();
    renderer.shadowMap.needsUpdate=true;
  }
  function setCamera(progress) {
    pose=progress;const p=cameraPose(progress);camera.position.set(p.x,p.y,p.z);camera.fov=p.fov;camera.lookAt(0,p.targetY,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    composite.uniforms.blur.value=p.blur;composite.uniforms.focus.value=camera.position.distanceTo(new THREE.Vector3(-1,2,0));
    for(const g of glows)g.quaternion.copy(camera.quaternion);anonymous.quaternion.copy(camera.quaternion);
  }
  const endpoint=(e,kind)=>{
    const u=units.get(e.id);if(!u||!u.model.visible)throw new Error('Effect endpoint is not visible');
    const p=hexWorld(e.hex),l=layout[e.id],point=u.model.localToWorld(u.asset.sockets[kind].clone());
    // If event-time coordinates differ, only explicitly supplied coordinates move the effect.
    point.x+=p.x-l.anchor.x;point.z+=p.z-l.anchor.z;
    if(point.y<BOARD.top+.4)throw new Error('Weapon endpoint intersects the board');return point;
  };
  function clearEffect(){for(const o of [beamCore,beamHalo,flare,anonymous])o.visible=false;currentEffect=null;}
  function setEffect(event,progress) {
    if(event&&!packet.events.includes(event))throw new Error('Effect must belong to the current frozen projection');
    clearEffect();if(!event||progress>=1)return;currentEffect=event;
    const pulse=Math.sin(Math.PI*Math.max(.015,progress));
    if(event.kind==='beam'){
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
      width:physical.width,height:physical.height,estimatedTargetMiB:(physical.width*physical.height*24+BUDGETS.shadowSize**2*4)/1048576,
      drawables:validateScene(scene)+validateScene(energyScene),camera:cameraPose(pose),activeEffect:currentEffect?.kind??null};
    return lastStats;
  }
  applyProjection(initial);setCamera(0);resize();render();
  if(lastStats.triangles>BUDGETS.maxTriangles||lastStats.drawCalls>BUDGETS.maxDrawCalls)throw new Error(`Slice budget exceeded: ${lastStats.triangles} triangles / ${lastStats.drawCalls} draws`);
  const api={ applyProjection,setCamera,setEffect,clearEffect,resize,render,
    inspect:()=>({...lastStats,threeRevision:THREE.REVISION,assets:loaded.map(a=>({key:a.asset.key,paint:a.asset.paint,triangles:a.triangles,
      sockets:Object.fromEntries(Object.entries(a.sockets).map(([k,v])=>[k,Array.isArray(v)?v.map(p=>p.toArray()):v.toArray()]))})),
      postHeights:manifest.assets.map(a=>a.stand.height),shadowLights:1,energyLights:energyScene.children.filter(o=>o.isLight).length}),
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
    dispose:()=>{physical.dispose();energy.dispose();blurH.dispose();blurV.dispose();renderer.dispose();}
  };
  return api;
}
