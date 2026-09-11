import * as THREE from 'three';

// Complete, surface-local brush support. No nearest-three truncation: each
// triangle sees every real crease whose brush can reach it on the same plane.
export function brushEdgeTexture(faces,creases){
 const segments=[...creases.ink.map(e=>({...e,kind:0})),...creases.raised.map(e=>({...e,kind:1}))];
 const cell=.24,reach=.045,grid=new Map(),key=(x,y,z)=>x+','+y+','+z;
 for(const [id,e] of segments.entries()){
  const lo=e.a.clone().min(e.b).addScalar(-reach).divideScalar(cell).floor(),hi=e.a.clone().max(e.b).addScalar(reach).divideScalar(cell).floor();
  for(let x=lo.x;x<=hi.x;x++)for(let y=lo.y;y<=hi.y;y++)for(let z=lo.z;z<=hi.z;z++){const k=key(x,y,z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(id);}
 }
 const refs=[],headers=[],indices=new Float32Array(faces.length*3);let maxReferences=0;
 const triangle=new THREE.Triangle(),closest=new THREE.Vector3(),line=new THREE.Line3();
 const pointSegment=(p,a,b)=>{line.set(a,b);return line.closestPointToPoint(p,true,closest).distanceToSquared(p);};
 function near(f,e){
  // Reject a crease on a parallel inset or another side of a thin panel.
  if(Math.abs(f.normal.dot(e.a.clone().sub(f.p[0])))>1e-4||Math.abs(f.normal.dot(e.b.clone().sub(f.p[0])))>1e-4)return false;
  triangle.set(...f.p);const r2=reach*reach;
  if(triangle.closestPointToPoint(e.a,closest).distanceToSquared(e.a)<=r2||triangle.closestPointToPoint(e.b,closest).distanceToSquared(e.b)<=r2)return true;
  if(f.p.some(p=>pointSegment(p,e.a,e.b)<=r2))return true;
  // A long segment may cross a triangle without having either endpoint nearby.
  const mid=e.a.clone().add(e.b).multiplyScalar(.5);if(triangle.containsPoint(mid))return true;
  for(let i=0;i<3;i++){
   const a=f.p[i],b=f.p[(i+1)%3],u=b.clone().sub(a),v=e.b.clone().sub(e.a),w=e.a.clone().sub(a),cross=u.clone().cross(v),d=cross.lengthSq();
   if(d>1e-12){const s=w.clone().cross(v).dot(cross)/d,t=w.clone().cross(u).dot(cross)/d;if(s>=0&&s<=1&&t>=0&&t<=1)return true;}
  }return false;
 }
 faces.forEach((f,i)=>{
  const box=new THREE.Box3().setFromPoints(f.p),lo=box.min.clone().divideScalar(cell).floor(),hi=box.max.clone().divideScalar(cell).floor(),candidates=new Set();
  for(let x=lo.x;x<=hi.x;x++)for(let y=lo.y;y<=hi.y;y++)for(let z=lo.z;z<=hi.z;z++)for(const id of grid.get(key(x,y,z))??[])candidates.add(id);
  const chosen=[...candidates].filter(id=>near(f,segments[id])).sort((a,b)=>a-b);
  if(chosen.length>1024)throw Error('Brush support exceeds reviewed 1024-segment cap; do not truncate');
  maxReferences=Math.max(maxReferences,chosen.length);headers.push([faces.length+refs.length/4,chosen.length,0,0]);
  refs.push(...chosen);while(refs.length%4)refs.push(-1);indices.fill(i,i*3,i*3+3);
 });
 const segmentStart=faces.length+refs.length/4,records=[...headers.flat(),...refs,...segments.flatMap(e=>[...e.a.toArray(),e.kind,...e.b.toArray(),0])];
 const width=1024,height=Math.max(1,Math.ceil(records.length/4/width)),data=new Float32Array(width*height*4);data.set(records);
 const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);texture.needsUpdate=true;texture.userData.byteLength=data.byteLength;texture.userData.segmentStart=segmentStart;
 return {texture,indices,evidence:{segments:segments.length,maxReferences,omittedReferences:0,surfacePlaneToleranceMm:.001,inkWidthMm:.24}};
}
