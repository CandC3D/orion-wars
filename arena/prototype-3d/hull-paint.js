import * as THREE from 'three';
import {physicalMaterial} from './materials.js';
import {brushEdgeTexture} from './paint-edges.js';

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
  if(faction==='VRA')geometry.computeVertexNormals(); // Keep the source's hard facets.
  const pos=geometry.attributes.position,col=geometry.attributes.color,n=pos.count;
  const faces=[],edges=new Map(),counts=Array(PALETTE.length).fill(0);
  const metal=new Float32Array(n),regionIds=new Float32Array(n),clear=new Float32Array(n),flat=new Float32Array(n),steel=new Float32Array(n),tint=new Float32Array(n*3);
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
      regionIds[i+j]=region+1;clear[i+j]=PALETTE[region].classification==='moulded transparent'?1:0;
      flat[i+j]=PALETTE[region].finish==='dead-flat'?1:0;steel[i+j]=['steel','alternate-steel'].includes(PALETTE[region].metal)?1:0;tint.set(PALETTE[region].finishTint??[1,1,1],(i+j)*3);
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
  geometry.setAttribute('paintSteel',new THREE.BufferAttribute(steel,1));
  geometry.setAttribute('paintTint',new THREE.BufferAttribute(tint,3));
  const brushData=brushEdgeTexture(faces,creaseSegments);
  geometry.userData.paintEdges=brushData.texture;
  geometry.setAttribute('paintFaceIndex',new THREE.BufferAttribute(brushData.indices,1));
  geometry.userData.paint={paletteTriangles:Object.fromEntries(PALETTE.map((p,i)=>[p.key,counts[i]])),concaveEdges:concave,raisedEdges:convex,unmatchedEdges:open,creaseThresholdDegrees:24,faction,...brushData.evidence,edgeWidthMm:.44,pickedWidthMm:.14};
  return geometry;
}

export function candidatePaint(faction,geometry) {
  const profile=artProfile(faction);
  const mat=physicalMaterial(profile.name+' / matte painted white metal',{color:'#ffffff',vertexColors:true,roughness:.98,metalness:0});
  const brush={value:1},audit={value:0},clearVariant={value:0};
  Object.assign(mat.userData,{brush,audit,clearVariant,metalFinish:METAL_FINISH,paintEdges:geometry.userData.paintEdges});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.paintSegmentStart={value:geometry.userData.paintEdges.userData.segmentStart};shader.uniforms.paintEdges={value:geometry.userData.paintEdges};shader.uniforms.paintEdgeSize={value:new THREE.Vector2(geometry.userData.paintEdges.image.width,geometry.userData.paintEdges.image.height)};shader.uniforms.brushStrength=brush;
    shader.uniforms.regionAudit=audit;shader.uniforms.clearVariant=clearVariant;
    shader.vertexShader=`attribute float paintFaceIndex,paintMetallic,paintRegionId,paintClear,paintFlat,paintSteel;attribute vec3 paintTint;
varying vec3 vPaintPosition,vPaintTint;varying float vPaintMetallic,vPaintFaceIndex,vPaintRegionId,vPaintClear,vPaintFlat,vPaintSteel;
`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vPaintMetallic=paintMetallic;vPaintPosition=position;vPaintFaceIndex=paintFaceIndex;vPaintRegionId=paintRegionId;vPaintClear=paintClear;vPaintFlat=paintFlat;vPaintSteel=paintSteel;vPaintTint=paintTint;`);
    shader.fragmentShader=`varying vec3 vPaintPosition,vPaintTint;varying float vPaintMetallic,vPaintFaceIndex,vPaintRegionId,vPaintClear,vPaintFlat,vPaintSteel;
uniform float regionAudit,clearVariant;
uniform sampler2D paintEdges;uniform vec2 paintEdgeSize;uniform float brushStrength,paintSegmentStart;
float paintGrain(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,41.117)))*43758.5453);}
float paintNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(paintGrain(i),paintGrain(i+vec3(1,0,0)),f.x),mix(paintGrain(i+vec3(0,1,0)),paintGrain(i+vec3(1,1,0)),f.x),f.y),mix(mix(paintGrain(i+vec3(0,0,1)),paintGrain(i+vec3(1,0,1)),f.x),mix(paintGrain(i+vec3(0,1,1)),paintGrain(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec4 edgeRecord(float index){return texture2D(paintEdges,(vec2(mod(index,paintEdgeSize.x),floor(index/paintEdgeSize.x))+.5)/paintEdgeSize);}
float segmentDistance(vec3 a,vec3 b){vec3 v=b-a;return length(vPaintPosition-a-v*clamp(dot(vPaintPosition-a,v)/dot(v,v),0.,1.))*10.;}
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
if(clearVariant*vPaintClear>.5)discard;
diffuseColor.rgb*=vPaintTint;
// All mark positions come from measured concave/convex mesh edges.
// Segment distance keeps widths physical; no arbitrary panel grid or trim bands.
vec4 header=edgeRecord(floor(vPaintFaceIndex+.5));
vec3 recessDistance=vec3(10000.),edgeDistance=vec3(10000.);
vec3 d0=vec3(1,0,0),d1=d0,d2=d0;
for(int j=0;j<1024;j++){if(float(j)>=header.y)break;
 vec4 ids=edgeRecord(header.x+floor(float(j)/4.));float id=ids[j-4*(j/4)];
 vec4 a=edgeRecord(paintSegmentStart+id*2.),b=edgeRecord(paintSegmentStart+id*2.+1.);float d=segmentDistance(a.xyz,b.xyz);
 if(a.w<.5)recessDistance.x=min(recessDistance.x,d);
 else {vec3 direction=normalize(b.xyz-a.xyz);if(d<edgeDistance.x){edgeDistance.z=edgeDistance.y;d2=d1;edgeDistance.y=edgeDistance.x;d1=d0;edgeDistance.x=d;d0=direction;}
 else if(d<edgeDistance.y){edgeDistance.z=edgeDistance.y;d2=d1;edgeDistance.y=d;d1=direction;}else if(d<edgeDistance.z){edgeDistance.z=d;d2=direction;}}
}
float recess=min(recessDistance.x,min(recessDistance.y,recessDistance.z));
float edge=min(edgeDistance.x,min(edgeDistance.y,edgeDistance.z));
float inkAA=max(.015,fwidth(recess)*.5),edgeAA=max(.015,fwidth(edge)*.5);
float ink=1.-smoothstep(.12-inkAA,.12+inkAA,recess);
// 0.2 mm broken chalk deposits along those edges. Average their coverage when
// smaller than a pixel, so the phase transition does not shimmer with random dots.
vec3 brushPosition=vPaintPosition*50.;
float footprint=max(length(dFdx(brushPosition)),length(dFdy(brushPosition)));
float resolved=1.-smoothstep(.45,1.0,footprint),grain=paintGrain(floor(brushPosition));
float dry=(1.-smoothstep(.22-edgeAA,.22+edgeAA,edge))*mix(.80,step(.20,grain),resolved);
float picked=(1.-smoothstep(.07-edgeAA,.07+edgeAA,edge));
// Opaque coats have slight brush coverage variation, never a directional gradient.
float coverage=paintNoise(vPaintPosition*11.);
float coverageResolved=1.-smoothstep(.5,1.5,max(length(dFdx(vPaintPosition*7.)),length(dFdy(vPaintPosition*7.))));
dry*=1.-ink*.8;picked*=1.-ink*.8;
// Fine flakes are spatially anchored in the binder and filtered below a pixel.
// They modulate the physical key response; no sparkle emits its own light.
vec3 flakePosition=vPaintPosition*(10./${METAL_FINISH.flakePitchMm});
float flakeResolved=1.-smoothstep(.6,2.0,max(length(dFdx(flakePosition)),length(dFdy(flakePosition))));
float flake=paintNoise(flakePosition);
float metalFilm=mix(.72,1.0+mix(0.,(coverage-.5)*.05,coverageResolved),vPaintSteel)+mix(0.,(flake-.5)*mix(.14,.18,vPaintSteel),flakeResolved);
vec3 coat=diffuseColor.rgb*mix(.625+mix(.02,coverage*.04,coverageResolved),metalFilm,vPaintMetallic);
coat=mix(coat,vec3(.006,.008,.006),ink*.91);
vec3 chalk=mix(diffuseColor.rgb,mix(vec3(.86,.83,.69),vec3(.94,.97,1.),vPaintSteel),.30);
coat=mix(coat,chalk,dry*mix(.55,mix(.20,.42,vPaintSteel),vPaintMetallic));
coat=mix(coat,mix(vec3(.78,.80,.72),mix(diffuseColor.rgb*.9+vec3(.14),vec3(.98,.99,1.),vPaintSteel),vPaintMetallic),picked*mix(.32,.80,vPaintSteel));
// Wear is restricted to actual convex corner intersections, never free-floating
// spots on flat plating. Sparse chipped tips expose bright alloy under the paint.
vec3 corners=1.-smoothstep(vec3(.035),vec3(.095),edgeDistance);

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
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );','/* Existing hemisphere supplies diffuse fill; captured room supplies reflection only. */'));
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
if(regionAudit>.5)gl_FragColor=vec4(vPaintRegionId/32.,.9375,.0625,1.);`);
  };
  mat.customProgramCacheKey=()=> 'controlled-complete-lining-bright-steel-v11';
  return mat;
}

// Copy exact faces of a confirmed connected patch. No replacement primitive and
// no added glow on unmapped radiators, collector or windows.
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
