import * as THREE from 'three';
import {SIZES,mm} from './scale.js';
import {faceFor} from '../../src/tactical/hex.js';

export const CODE_FACES=Object.freeze([2,4,6]);
// Ring index zero is the front-right skirt. Derive numbered faces from
// hex.js, never from a second hand-maintained arc table.
export const skirtFace=i=>faceFor(0,((i-1)%6+6)%6);
export const FACING_TRIANGLE=Object.freeze({lengthMm:5.9,widthMm:5,reliefMm:.35});

export const BASE_APEX=mm(SIZES.baseHeight+SIZES.basePyramidRise);
export function baseGeometry(){
  // Keep the previous skirt's bottom/top radii and height exactly. Six new
  // planar roof triangles meet at the centre; no rounded dome or flat plateau.
  const r=mm(SIZES.baseAcrossFlats)/Math.sqrt(3),top=r-.055,h=mm(SIZES.baseHeight);
  const p=[],ring=(i,y,radius)=>[Math.sin(i*Math.PI/3)*radius,y,Math.cos(i*Math.PI/3)*radius];
  const tri=(a,b,c)=>p.push(...a,...b,...c);
  for(let i=0;i<6;i++){
    const a=ring(i,0,r),b=ring(i+1,0,r),c=ring(i,h,top),d=ring(i+1,h,top);
    tri(a,b,c);tri(b,d,c);tri(c,d,[0,BASE_APEX,0]);tri(b,a,[0,0,0]);
  }
  const castingStart=p.length/3,apothem=top*Math.cos(Math.PI/6);
  const roof=(x,z)=>[x,BASE_APEX-(BASE_APEX-h)*x/apothem,z];
  const lower=[roof(1.03,0),roof(.44,-.25),roof(.44,.25)];
  const centre=lower.reduce((s,v)=>s.map((n,i)=>n+v[i]/3),[0,0,0]);
  const upper=lower.map(v=>v.map((n,i)=>i===1?n+mm(FACING_TRIANGLE.reliefMm):centre[i]+(n-centre[i])*.92));
  tri(...upper);
  for(let i=0;i<3;i++){const j=(i+1)%3;tri(lower[i],lower[j],upper[i]);tri(lower[j],upper[j],upper[i]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();
  g.userData.facingTriangle={...FACING_TRIANGLE,face:2,bow:[1,0,0],corners:upper,castingStart};
  g.userData.scale={acrossFlatsMm:SIZES.baseAcrossFlats,skirtHeightMm:SIZES.baseHeight,pyramidRiseMm:SIZES.basePyramidRise,apexHeightMm:BASE_APEX*10};
  return g;
}
export function postGeometry(segments=32){const g=new THREE.CylinderGeometry(mm(SIZES.postTopDiameter/2),mm(SIZES.postBottomDiameter/2),mm(SIZES.postHeight),segments);g.setAttribute('opticalVolume',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));return g;}
export function standScaleRows(base=baseGeometry(),post=postGeometry()){
 base.computeBoundingBox();post.computeBoundingBox();
 const bp=base.attributes.position,pp=post.attributes.position;
 const levels=[...new Set(Array.from({length:bp.count},(_,i)=>bp.getY(i)))].sort((a,b)=>a-b);
 const radiusAt=y=>Math.max(...Array.from({length:pp.count},(_,i)=>Math.abs(pp.getY(i)-y)<1e-5?Math.hypot(pp.getX(i),pp.getZ(i)):0));
 const measurements=[
  ['Black base skirt','across flats / bevelled skirt height',[base.boundingBox.max.x-base.boundingBox.min.x,levels[1]-levels[0]],[25,3]],
  ['Black base pyramid','rise above skirt / total apex height',[base.boundingBox.max.y-levels[1],base.boundingBox.max.y-levels[0]],[2,5]],
  ['Clear tapered post','bottom diameter / top diameter / exposed length',[radiusAt(post.boundingBox.min.y)*2,radiusAt(post.boundingBox.max.y)*2,post.boundingBox.max.y-post.boundingBox.min.y],[3,2.4,30]],
  ['Cast arc-2 triangle','length / width / relief',[.59,.5,.035],[5.9,5,.35]]
 ];
 return measurements.map(([object,basis,sceneUnits,referenceMm])=>({object,basis,sceneUnits,actualMm:sceneUnits.map(n=>n*10),referenceMm}));
}
