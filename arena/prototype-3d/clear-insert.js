import * as THREE from 'three';
import {patchGeometry} from './hull-paint.js';
import {convexPlanes,plasticMaterial,transmittingShadow} from './moulded-plastic.js';

export function clearInsert(hullGeometry,regions){
 const spec=regions.palette.find(p=>p.key==='46b749');
 if(regions.faction!=='VRA'||spec?.variant?.classification!=='moulded transparent')throw Error('Missing approved clear insert classification');
 const patches=regions.patches.filter(p=>p.region===spec.key),faces=patches.flatMap(p=>p.faces);
 const geometry=patchGeometry(hullGeometry,faces),allPlanes=[],volumes=[],evidence=[];let offset=0;
 for(const p of patches){
  const count=p.faces.length*3,points=[];for(let i=offset;i<offset+count;i++)points.push([geometry.attributes.position.getX(i),geometry.attributes.position.getY(i),geometry.attributes.position.getZ(i)]);
  const planes=convexPlanes(points),start=allPlanes.length;allPlanes.push(...planes);
  for(let i=0;i<count;i++)volumes.push(start,planes.length);
  evidence.push({triangles:p.faces.length,min:p.min,max:p.max,opticalPlanes:planes.length});offset+=count;
 }
 const data=new THREE.DataTexture(new Float32Array(allPlanes.flat()),allPlanes.length,1,THREE.RGBAFormat,THREE.FloatType);data.needsUpdate=true;data.userData.byteLength=allPlanes.length*16;
 geometry.setAttribute('opticalVolume',new THREE.Float32BufferAttribute(volumes,2));geometry.computeBoundingBox();
 const material=plasticMaterial({name:'Vraygon / optional moulded green styrene',colour:[70/255,183/255,73/255],attenuationDistance:.25,planes:data});
 material.userData.opticalPlanes=data;
 const mesh=new THREE.Mesh(geometry,material);mesh.name=material.name;mesh.userData.register='physical';mesh.castShadow=mesh.receiveShadow=true;mesh.visible=false;transmittingShadow(mesh,.24);
 mesh.userData.evidence={sourceRegion:spec.key,triangles:faces.length,sizeMm:geometry.boundingBox.getSize(new THREE.Vector3()).toArray().map(n=>n*10),patches:evidence,approximation:'convex optical cap per connected authored patch; stochastic transmitting shadow; no caustics or multiple internal reflections'};
 return mesh;
}
