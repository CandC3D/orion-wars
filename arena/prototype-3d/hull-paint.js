import * as THREE from 'three';
import {physicalMaterial} from './materials.js';

import {artProfile,METAL_FINISH} from './hull-art.js';
import {validateFactionPalette,factionRegion} from './faction-palettes.js';

export function regionOf(c, faction, PALETTE=artProfile(faction).palette) {
  let best=-1,distance=Infinity;
  PALETTE.forEach((p,i)=>{const d=p.rgb.reduce((n,v,k)=>n+(v-c[k])**2,0);if(d<distance){best=i;distance=d;}});
  // Blender's BYTE_COLOR round trip perturbs three keys slightly. Re-anchor only
  // that small quantisation error to the exact source palette; reject unknown art.
  if(distance>.0001)throw new Error('Unknown COLOR_0 region; inspect the source before painting');
  return best;
}

export function preparePaintGeometry(original, faction, PALETTE=artProfile(faction).palette) {
  validateFactionPalette(faction,PALETTE.map(p=>p.key));
  for(const r of PALETTE){const expected=factionRegion(faction,r.key);for(const k of ['classification','metal','metallicPaint','finish','finishTint','variant','rgb'])if(JSON.stringify(r[k])!==JSON.stringify(expected[k]))throw Error('Hull material overrides faction contract: '+faction+'/'+r.key+'/'+k);}
  if(!original.attributes.color)throw new Error(faction+' requires authored COLOR_0');
  const geometry=original.index?original.toNonIndexed():original.clone();
  const pos=geometry.attributes.position,col=geometry.attributes.color,n=pos.count;
  const faces=[],edges=new Map(),counts=Array(PALETTE.length).fill(0);
  const metal=new Float32Array(n),regionIds=new Float32Array(n),clear=new Float32Array(n),flat=new Float32Array(n),tint=new Float32Array(n*3);
  const point=i=>new THREE.Vector3().fromBufferAttribute(pos,i);
  const key=v=>v.toArray().map(n=>Math.round(n*1e5)).join(',');
  for(let i=0;i<n;i+=3){
    const p=[point(i),point(i+1),point(i+2)],regions=[0,1,2].map(j=>regionOf([col.getX(i+j),col.getY(i+j),col.getZ(i+j)],faction,PALETTE));
    if(new Set(regions).size!==1)throw new Error('A reduced face crosses an authored paint region');
    const region=regions[0];counts[region]++;
    const cross=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])),normal=cross.clone().normalize();
    const face={p,normal,region,ink:[0,0,0],raised:[0,0,0],height:[]};faces.push(face);
    for(let j=0;j<3;j++){
      col.setXYZ(i+j,...PALETTE[region].rgb);metal[i+j]=PALETTE[region].metallicPaint?1:0;
      regionIds[i+j]=region+1;clear[i+j]=PALETTE[region].variant?1:0;
      flat[i+j]=PALETTE[region].finish==='dead-flat'?1:0;tint.set(PALETTE[region].finishTint??[1,1,1],(i+j)*3);
      const a=p[(j+1)%3],b=p[(j+2)%3],e=[key(a),key(b)].sort().join('|');
      face.height[j]=cross.length()/a.distanceTo(b);
      if(!edges.has(e))edges.set(e,[]);edges.get(e).push({face,opposite:j});
    }
  }
  let concave=0,convex=0,open=0;const creaseSegments={ink:[],raised:[]};
  for(const pair of edges.values()){
    if(pair.length!==2){open++;continue;} // Do not invent paint seams on unmatched edges.
    const [a,b]=pair,dot=a.face.normal.dot(b.face.normal);
    if(dot>Math.cos(24*Math.PI/180))continue; // Smooth triangulation is not panel detail.
    const signed=b.face.p[b.opposite].clone().sub(a.face.p[(a.opposite+1)%3]).dot(a.face.normal);
    if(Math.abs(signed)<1e-7)continue;
    const property=signed>0?'ink':'raised';a.face[property][a.opposite]=b.face[property][b.opposite]=1;
    creaseSegments[property].push({a:a.face.p[(a.opposite+1)%3].clone(),b:a.face.p[(a.opposite+2)%3].clone()});
    if(signed>0)concave++;else convex++;
  }
  geometry.setAttribute('paintMetallic',new THREE.BufferAttribute(metal,1));
  geometry.setAttribute('paintRegionId',new THREE.BufferAttribute(regionIds,1));
  geometry.setAttribute('paintClear',new THREE.BufferAttribute(clear,1));
  geometry.setAttribute('paintFlat',new THREE.BufferAttribute(flat,1));
  geometry.setAttribute('paintTint',new THREE.BufferAttribute(tint,3));
  // Neighbouring triangles must see the same crease. A wider brush cannot stop
  // at a tessellation boundary. Store the nearest actual segments per face in a
  // float data texture; these are geometric distances, not a painted panel atlas.
  const cell=.16,grid=new Map(),cellKey=(x,y,z)=>x+','+y+','+z;
  const segments=[...creaseSegments.ink.map(e=>({...e,kind:0})),...creaseSegments.raised.map(e=>({...e,kind:1}))];
  segments.forEach((e,id)=>{
    const lo=e.a.clone().min(e.b).multiplyScalar(1/cell).floor(),hi=e.a.clone().max(e.b).multiplyScalar(1/cell).floor();
    for(let x=lo.x;x<=hi.x;x++)for(let y=lo.y;y<=hi.y;y++)for(let z=lo.z;z<=hi.z;z++){
      const key=cellKey(x,y,z);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(id);
    }
  });
  const width=256,height=Math.ceil(faces.length*12/width),data=new Float32Array(width*height*4),faceIndex=new Float32Array(n);
  const distance=(p,e)=>{const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,dz=e.b.z-e.a.z,t=Math.max(0,Math.min(1,((p.x-e.a.x)*dx+(p.y-e.a.y)*dy+(p.z-e.a.z)*dz)/(dx*dx+dy*dy+dz*dz)));
    return (p.x-e.a.x-t*dx)**2+(p.y-e.a.y-t*dy)**2+(p.z-e.a.z-t*dz)**2;};
  faces.forEach((f,i)=>{
    const centre=f.p[0].clone().add(f.p[1]).add(f.p[2]).multiplyScalar(1/3),candidates=new Set();
    for(const p of [...f.p,centre]){
      const q=p.clone().multiplyScalar(1/cell).floor();
      for(let x=q.x-1;x<=q.x+1;x++)for(let y=q.y-1;y<=q.y+1;y++)for(let z=q.z-1;z<=q.z+1;z++)for(const id of grid.get(cellKey(x,y,z))??[])candidates.add(id);
    }
    const near=[...candidates].map(id=>({e:segments[id],d:distance(centre,segments[id])})).sort((a,b)=>a.d-b.d);
    for(let kind=0;kind<2;kind++){
      const chosen=near.filter(v=>v.e.kind===kind).slice(0,3);
      for(let j=0;j<3;j++){
        const e=chosen[j]?.e??{a:new THREE.Vector3(1000,1000,1000),b:new THREE.Vector3(1001,1000,1000)};
        for(let k=0;k<2;k++){const p=k?e.b:e.a,at=(i*12+kind*6+j*2+k)*4;data.set([p.x,p.y,p.z,0],at);}
      }
    }
    faceIndex.fill(i,i*3,i*3+3);
  });
  const edgeTexture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);edgeTexture.needsUpdate=true;
  edgeTexture.userData.byteLength=data.byteLength;geometry.userData.paintEdges=edgeTexture;
  geometry.setAttribute('paintFaceIndex',new THREE.BufferAttribute(faceIndex,1));
  geometry.userData.paint={paletteTriangles:Object.fromEntries(PALETTE.map((p,i)=>[p.key,counts[i]])),concaveEdges:concave,raisedEdges:convex,unmatchedEdges:open,creaseThresholdDegrees:24,faction,inkWidthMm:.25,edgeWidthMm:.38,pickedWidthMm:.12};
  return geometry;
}

export function candidatePaint(faction,geometry) {
  const profile=artProfile(faction);
  const mat=physicalMaterial(profile.name+' / matte painted white metal',{color:'#ffffff',vertexColors:true,roughness:.98,metalness:0});
  const brush={value:1},audit={value:0},clearVariant={value:0};
  Object.assign(mat.userData,{brush,audit,clearVariant,metalFinish:METAL_FINISH,paintEdges:geometry.userData.paintEdges});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.paintEdges={value:geometry.userData.paintEdges};shader.uniforms.paintEdgeSize={value:new THREE.Vector2(geometry.userData.paintEdges.image.width,geometry.userData.paintEdges.image.height)};shader.uniforms.brushStrength=brush;
    shader.uniforms.regionAudit=audit;shader.uniforms.clearVariant=clearVariant;
    shader.vertexShader=`attribute float paintFaceIndex,paintMetallic,paintRegionId,paintClear,paintFlat;attribute vec3 paintTint;
varying vec3 vPaintPosition,vPaintTint;varying float vPaintMetallic,vPaintFaceIndex,vPaintRegionId,vPaintClear,vPaintFlat;
`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vPaintMetallic=paintMetallic;vPaintPosition=position;vPaintFaceIndex=paintFaceIndex;vPaintRegionId=paintRegionId;vPaintClear=paintClear;vPaintFlat=paintFlat;vPaintTint=paintTint;`);
    shader.fragmentShader=`varying vec3 vPaintPosition,vPaintTint;varying float vPaintMetallic,vPaintFaceIndex,vPaintRegionId,vPaintClear,vPaintFlat;
uniform float regionAudit,clearVariant;
uniform sampler2D paintEdges;uniform vec2 paintEdgeSize;uniform float brushStrength;
float paintGrain(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,41.117)))*43758.5453);}
float paintNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(paintGrain(i),paintGrain(i+vec3(1,0,0)),f.x),mix(paintGrain(i+vec3(0,1,0)),paintGrain(i+vec3(1,1,0)),f.x),f.y),mix(mix(paintGrain(i+vec3(0,0,1)),paintGrain(i+vec3(1,0,1)),f.x),mix(paintGrain(i+vec3(0,1,1)),paintGrain(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 edgePoint(float index){return texture2D(paintEdges,(vec2(mod(index,paintEdgeSize.x),floor(index/paintEdgeSize.x))+.5)/paintEdgeSize).xyz;}
float segmentDistance(float index){vec3 a=edgePoint(index),b=edgePoint(index+1.),v=b-a;return length(vPaintPosition-a-v*clamp(dot(vPaintPosition-a,v)/dot(v,v),0.,1.))*10.;}
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
if(clearVariant*vPaintClear>.5)discard;
diffuseColor.rgb*=vPaintTint;
// All mark positions come from measured concave/convex mesh edges.
// Segment distance keeps widths physical; no arbitrary panel grid or trim bands.
float edgeIndex=floor(vPaintFaceIndex+.5)*12.;
vec3 recessDistance=vec3(segmentDistance(edgeIndex),segmentDistance(edgeIndex+2.),segmentDistance(edgeIndex+4.));
vec3 edgeDistance=vec3(segmentDistance(edgeIndex+6.),segmentDistance(edgeIndex+8.),segmentDistance(edgeIndex+10.));
float recess=min(recessDistance.x,min(recessDistance.y,recessDistance.z));
float edge=min(edgeDistance.x,min(edgeDistance.y,edgeDistance.z));
float inkAA=max(.015,fwidth(recess)*.5),edgeAA=max(.015,fwidth(edge)*.5);
float ink=1.-smoothstep(.25-inkAA,.25+inkAA,recess);
// 0.2 mm broken chalk deposits along those edges. Average their coverage when
// smaller than a pixel, so the phase transition does not shimmer with random dots.
vec3 brushPosition=vPaintPosition*50.;
float footprint=max(length(dFdx(brushPosition)),length(dFdy(brushPosition)));
float resolved=1.-smoothstep(.45,1.0,footprint),grain=paintGrain(floor(brushPosition));
float dry=(1.-smoothstep(.38-edgeAA,.38+edgeAA,edge))*mix(.80,step(.20,grain),resolved);
float picked=(1.-smoothstep(.12-edgeAA,.12+edgeAA,edge))*mix(.64,step(.36,grain),resolved);
// Opaque coats have slight brush coverage variation, never a directional gradient.
float coverage=paintNoise(vPaintPosition*11.);
float coverageResolved=1.-smoothstep(.5,1.5,max(length(dFdx(vPaintPosition*7.)),length(dFdy(vPaintPosition*7.))));
dry*=1.-ink*.8;picked*=1.-ink*.8;
// Fine flakes are spatially anchored in the binder and filtered below a pixel.
// They modulate the physical key response; no sparkle emits its own light.
vec3 flakePosition=vPaintPosition*(10./${METAL_FINISH.flakePitchMm});
float flakeResolved=1.-smoothstep(.6,2.0,max(length(dFdx(flakePosition)),length(dFdy(flakePosition))));
float flake=paintNoise(flakePosition);
float metalFilm=.72+mix(0.,(flake-.5)*.14,flakeResolved);
vec3 coat=diffuseColor.rgb*mix(.625+mix(.02,coverage*.04,coverageResolved),metalFilm,vPaintMetallic);
coat=mix(coat,vec3(.006,.008,.006),ink*.91);
vec3 chalk=mix(diffuseColor.rgb,vec3(.86,.83,.69),.30);
coat=mix(coat,chalk,dry*mix(.55,.20,vPaintMetallic));
coat=mix(coat,mix(vec3(.78,.80,.72),diffuseColor.rgb*.9+vec3(.14),vPaintMetallic),picked*.32);
// Wear is restricted to actual convex corner intersections, never free-floating
// spots on flat plating. Sparse chipped tips expose bright alloy under the paint.
vec3 corners=1.-smoothstep(vec3(.035),vec3(.095),edgeDistance);
vec3 d0=normalize(edgePoint(edgeIndex+7.)-edgePoint(edgeIndex+6.)),d1=normalize(edgePoint(edgeIndex+9.)-edgePoint(edgeIndex+8.)),d2=normalize(edgePoint(edgeIndex+11.)-edgePoint(edgeIndex+10.));
float corner=max(corners.x*corners.y*step(abs(dot(d0,d1)),.85),max(corners.y*corners.z*step(abs(dot(d1,d2)),.85),corners.x*corners.z*step(abs(dot(d0,d2)),.85)));
float chip=corner*step(.96,paintGrain(floor(vPaintPosition*13.)));
coat=mix(coat,vec3(.62,.64,.62),chip*.85);
diffuseColor.rgb=mix(diffuseColor.rgb*mix(.645,.72,vPaintMetallic),coat,brushStrength);
`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=mix(.98,${METAL_FINISH.roughness}+(flake-.5)*.12*flakeResolved,vPaintMetallic);roughnessFactor=mix(roughnessFactor,.34,ink*.8);roughnessFactor=mix(roughnessFactor,.96,dry*.6*(1.-vPaintMetallic));roughnessFactor=mix(roughnessFactor,${METAL_FINISH.edgeRoughness},max(chip,picked*vPaintMetallic*.8));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
metalnessFactor=max(vPaintMetallic*(${METAL_FINISH.metalness}+picked*.10)*(1.-ink*.7),chip*.5)*(1.-vPaintFlat);
roughnessFactor=mix(roughnessFactor,1.,vPaintFlat);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
// Microscopic flake normals, averaged away at play distance. No broad polish.
vec3 flakeNormal=vec3(flake-.5,paintGrain(floor(flakePosition)+17.)-.5,paintGrain(floor(flakePosition)+41.)-.5);
normal=normalize(normal+flakeNormal*.065*flakeResolved*vPaintMetallic*(1.-ink));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
// Flat paint absorbs the room key: suppress the dielectric broad specular lobe.
// The small ink pools and dull metallic paint retain their own local return.
material.specularColor*=mix(.035,1.,max(vPaintMetallic,max(ink*.75,chip)))*(1.-vPaintFlat);
material.specularF90*=1.-vPaintFlat;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
if(regionAudit>.5)gl_FragColor=vec4(vPaintRegionId/32.,.9375,.0625,1.);`);
  };
  mat.customProgramCacheKey=()=> 'faction-metals-and-flat-deck-v6';
  return mat;
}

// Copy exact faces of a confirmed connected patch. No replacement primitive and
// no added glow on the unknown smaller dome, radiators, collector or windows.
export function patchGeometry(geometry,faces){
  if(faces.some(i=>!Number.isInteger(i)||i<0||i>=geometry.attributes.position.count/3))throw new Error('Semantic patch references a missing triangle');
  const result=new THREE.BufferGeometry();
  for(const name of ['position','normal','uv']){
    const a=geometry.attributes[name];if(!a)continue;const values=[];
    for(const face of faces)for(let j=0;j<3;j++)for(let k=0;k<a.itemSize;k++)values.push(a.array[(face*3+j)*a.itemSize+k]);
    result.setAttribute(name,new THREE.Float32BufferAttribute(values,a.itemSize));
  }
  if(!result.attributes.uv)result.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(faces.length*6),2));
  return result;
}
