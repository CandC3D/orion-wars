import * as THREE from 'three';
import {physicalMaterial} from './materials.js';

// These are the source's LINEAR COLOR_0 values, not sRGB strings to decode again.
export const PALETTE = Object.freeze([
  {key:'126936',rgb:[18/255,105/255,54/255],role:'painted hull green A'},
  {key:'46b749',rgb:[70/255,183/255,73/255],role:'painted hull green B; distinction unresolved'},
  {key:'a97b50',rgb:[169/255,123/255,80/255],role:'metallic bronze'},
  {key:'f5831f',rgb:[245/255,131/255,31/255],role:'orange paint'},
  {key:'fafafa',rgb:[250/255,250/255,250/255],role:'white paint'},
  {key:'ffdd1a',rgb:[1,221/255,26/255],role:'yellow paint'},
  {key:'e91d2d',rgb:[233/255,29/255,45/255],role:'red warning paint'}
]);
export function regionOf(c) {
  let best=-1,distance=Infinity;
  PALETTE.forEach((p,i)=>{const d=p.rgb.reduce((n,v,k)=>n+(v-c[k])**2,0);if(d<distance){best=i;distance=d;}});
  // Blender's BYTE_COLOR round trip perturbs three keys slightly. Re-anchor only
  // that small quantisation error to the exact source palette; reject unknown art.
  if(distance>.0001)throw new Error('Unknown COLOR_0 region; inspect the source before painting');
  return best;
}

export function preparePaintGeometry(original) {
  if(!original.attributes.color)throw new Error('Sparrowhawk requires authored COLOR_0');
  const geometry=original.index?original.toNonIndexed():original.clone();
  const pos=geometry.attributes.position,col=geometry.attributes.color,n=pos.count;
  const faces=[],edges=new Map(),counts=Array(7).fill(0);
  const bary=new Float32Array(n*3),altitudes=new Float32Array(n*3),ink=new Float32Array(n*3),raised=new Float32Array(n*3),metal=new Float32Array(n);
  const point=i=>new THREE.Vector3().fromBufferAttribute(pos,i);
  const key=v=>v.toArray().map(n=>Math.round(n*1e5)).join(',');
  for(let i=0;i<n;i+=3){
    const p=[point(i),point(i+1),point(i+2)],regions=[0,1,2].map(j=>regionOf([col.getX(i+j),col.getY(i+j),col.getZ(i+j)]));
    if(new Set(regions).size!==1)throw new Error('A reduced face crosses an authored paint region');
    const region=regions[0];counts[region]++;
    const cross=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])),normal=cross.clone().normalize();
    const face={p,normal,region,ink:[0,0,0],raised:[0,0,0],height:[]};faces.push(face);
    for(let j=0;j<3;j++){
      col.setXYZ(i+j,...PALETTE[region].rgb);metal[i+j]=region===2?1:0;bary[(i+j)*3+j]=1;
      const a=p[(j+1)%3],b=p[(j+2)%3],e=[key(a),key(b)].sort().join('|');
      face.height[j]=cross.length()/a.distanceTo(b);
      if(!edges.has(e))edges.set(e,[]);edges.get(e).push({face,opposite:j});
    }
  }
  let concave=0,convex=0,open=0;
  for(const pair of edges.values()){
    if(pair.length!==2){open++;continue;} // Do not invent paint seams on unmatched edges.
    const [a,b]=pair,dot=a.face.normal.dot(b.face.normal);
    if(dot>Math.cos(24*Math.PI/180))continue; // Smooth triangulation is not panel detail.
    const signed=b.face.p[b.opposite].clone().sub(a.face.p[(a.opposite+1)%3]).dot(a.face.normal);
    if(Math.abs(signed)<1e-7)continue;
    const property=signed>0?'ink':'raised';a.face[property][a.opposite]=b.face[property][b.opposite]=1;
    if(signed>0)concave++;else convex++;
  }
  faces.forEach((f,i)=>{for(let j=0;j<3;j++)for(let k=0;k<3;k++){
    const at=(i*3+j)*3+k;altitudes[at]=f.height[k];ink[at]=f.ink[k];raised[at]=f.raised[k];
  }});
  geometry.setAttribute('paintBary',new THREE.BufferAttribute(bary,3));
  geometry.setAttribute('paintAltitude',new THREE.BufferAttribute(altitudes,3));
  geometry.setAttribute('paintInk',new THREE.BufferAttribute(ink,3));
  geometry.setAttribute('paintRaised',new THREE.BufferAttribute(raised,3));
  geometry.setAttribute('paintBronze',new THREE.BufferAttribute(metal,1));
  geometry.userData.paint={paletteTriangles:Object.fromEntries(PALETTE.map((p,i)=>[p.key,counts[i]])),concaveEdges:concave,raisedEdges:convex,unmatchedEdges:open,creaseThresholdDegrees:24,inkWidthMm:.14,edgeWidthMm:.22};
  return geometry;
}

export function candidatePaint() {
  const mat=physicalMaterial('Sparrowhawk / seven authored paint regions',{color:'#ffffff',vertexColors:true,roughness:.84,metalness:0});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader=`attribute vec3 paintBary,paintAltitude,paintInk,paintRaised;attribute float paintBronze;
varying vec3 vPaintBary,vPaintAltitude,vPaintInk,vPaintRaised,vPaintPosition;varying float vPaintBronze;
`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vPaintBary=paintBary;vPaintAltitude=paintAltitude;vPaintInk=paintInk;vPaintRaised=paintRaised;vPaintBronze=paintBronze;vPaintPosition=position;`);
    shader.fragmentShader=`varying vec3 vPaintBary,vPaintAltitude,vPaintInk,vPaintRaised,vPaintPosition;varying float vPaintBronze;
float paintGrain(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,41.117)))*43758.5453);}
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
// All mark positions come from measured concave/convex mesh edges. Barycentric
// distance keeps the brush width physical; no arbitrary panel grid or trim bands.
vec3 dist=vPaintBary*vPaintAltitude*10.;
vec3 recessDistance=mix(vec3(1000.),dist,vPaintInk),edgeDistance=mix(vec3(1000.),dist,vPaintRaised);
float recess=min(recessDistance.x,min(recessDistance.y,recessDistance.z));
float edge=min(edgeDistance.x,min(edgeDistance.y,edgeDistance.z));
float inkAA=max(.015,fwidth(recess)*.5),edgeAA=max(.015,fwidth(edge)*.5);
float ink=1.-smoothstep(.14-inkAA,.14+inkAA,recess);
// 0.2 mm broken chalk deposits along those edges. Average their coverage when
// smaller than a pixel, so the phase transition does not shimmer with random dots.
vec3 brushPosition=vPaintPosition*50.;
float footprint=max(length(dFdx(brushPosition)),length(dFdy(brushPosition)));
float resolved=1.-smoothstep(.45,1.0,footprint),grain=paintGrain(floor(brushPosition));
float dry=(1.-smoothstep(.22-edgeAA,.22+edgeAA,edge))*mix(.80,step(.20,grain),resolved);
float picked=(1.-smoothstep(.065-edgeAA,.065+edgeAA,edge))*mix(.64,step(.36,grain),resolved);
vec3 coat=diffuseColor.rgb*.68;
coat=mix(coat,vec3(.006,.008,.006),ink*.90);
vec3 chalk=mix(diffuseColor.rgb,vec3(.86,.83,.69),.52);
coat=mix(coat,chalk,dry*.48);
coat=mix(coat,mix(vec3(.78,.80,.72),vec3(.82,.66,.36),vPaintBronze),picked*.48);
diffuseColor.rgb=coat;
`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=mix(.86,.43,vPaintBronze);roughnessFactor=mix(roughnessFactor,.32,ink*.8);roughnessFactor=mix(roughnessFactor,.92,dry*.6);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
metalnessFactor=vPaintBronze*.64;`);
  };
  mat.customProgramCacheKey=()=> 'sparrowhawk-authored-colour-geometric-brush-v1';
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
