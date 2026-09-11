import * as THREE from 'three';
import {patchGeometry} from './hull-paint.js';
import {convexPlanes,plasticMaterial,transmittingShadow} from './moulded-plastic.js';

export function clearInsert(hullGeometry,regions){
 const spec=regions.palette.find(p=>p.key==='46b749');
 if(regions.faction!=='VRA'||spec?.classification!=='moulded transparent')throw Error('Missing approved clear insert classification');
 const patches=regions.patches.filter(p=>p.region===spec.key),faces=patches.flatMap(p=>p.faces);
 const geometry=patchGeometry(hullGeometry,faces),allPlanes=[],volumes=[],evidence=[];let offset=0;
 const parts=patches.map(p=>{const points=[];for(let i=offset;i<offset+p.faces.length*3;i++)points.push([geometry.attributes.position.getX(i),geometry.attributes.position.getY(i),geometry.attributes.position.getZ(i)]);offset+=p.faces.length*3;return {patch:p,points,extent:p.max.map((v,k)=>v-p.min[k])};});
 // Point and Avalanche include planar rear caps separated from their matching
 // clear tips by an opaque housing. Use both actual ends for the optical volume;
 // do not invent thickness, move a visible triangle, or make the housing clear.
 for(const part of parts.filter(p=>Math.min(...p.extent)<1e-5)){
  const axis=part.extent.indexOf(Math.min(...part.extent)),other=[0,1,2].filter(k=>k!==axis);
  const matches=parts.filter(p=>p!==part&&Math.min(...p.extent)>1e-5&&other.every(k=>part.patch.min[k]>=p.patch.min[k]-.002&&part.patch.max[k]<=p.patch.max[k]+.002)&&Math.min(Math.abs(part.patch.min[axis]-p.patch.min[axis]),Math.abs(part.patch.min[axis]-p.patch.max[axis]))<Math.max(...p.extent));
  if(matches.length!==1)throw Error('Planar crystal cap lacks one geometrically matching tip; inspect source');
  part.volume=matches[0];
 }
 for(const part of parts){const p=part.patch,count=p.faces.length*3,root=part.volume??part;
  const points=parts.filter(other=>other===root||other.volume===root).flatMap(other=>other.points);
  const planes=convexPlanes(points),start=allPlanes.length;allPlanes.push(...planes);
  for(let i=0;i<count;i++)volumes.push(start,planes.length);
  evidence.push({triangles:p.faces.length,min:p.min,max:p.max,opticalPlanes:planes.length,groupedAuthoredCaps:parts.filter(other=>other.volume===root).length});
 }
 const data=new THREE.DataTexture(new Float32Array(allPlanes.flat()),allPlanes.length,1,THREE.RGBAFormat,THREE.FloatType);data.needsUpdate=true;data.userData.byteLength=allPlanes.length*16;
 geometry.setAttribute('opticalVolume',new THREE.Float32BufferAttribute(volumes,2));geometry.computeBoundingBox();
 const material=plasticMaterial({name:'Vraygon / approved moulded green styrene',colour:[70/255,183/255,73/255],attenuationDistance:.25,planes:data});
 material.userData.opticalPlanes=data;
 const mesh=new THREE.Mesh(geometry,material);mesh.name=material.name;mesh.userData.register='physical';mesh.castShadow=mesh.receiveShadow=true;mesh.visible=true;transmittingShadow(mesh,.24);
 mesh.userData.evidence={sourceRegion:spec.key,triangles:faces.length,sizeMm:geometry.boundingBox.getSize(new THREE.Vector3()).toArray().map(n=>n*10),patches:evidence,approximation:'convex optical cap per connected authored patch; stochastic transmitting shadow; no caustics or multiple internal reflections'};
 return mesh;
}
