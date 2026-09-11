import * as THREE from 'three';
import {GLTFLoader} from './vendor/three-r180/loaders/GLTFLoader.js';
import {preparePaintGeometry,candidatePaint} from './hull-paint.js';
import {factionRegion} from './faction-palettes.js';
const manifest=await (await fetch('./fleet-assets.json')).json(),inventory=await (await fetch('./prepared/fleet/inventory.json')).json();
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,720,false);
const scene=new THREE.Scene();scene.background=new THREE.Color('#655744');scene.add(new THREE.HemisphereLight('#d5deeb','#75614b',1.3));const key=new THREE.DirectionalLight('#ffe0ad',3.1);key.position.set(-25,65,30);scene.add(key);
const camera=new THREE.PerspectiveCamera(13,1000/720,1,250);camera.position.set(0,24,32);camera.lookAt(0,0,0);camera.updateMatrixWorld();
let source,prepared,hull,paint,exported,flat,record;
async function raw(url){const g=await new GLTFLoader().loadAsync(url);g.scene.updateMatrixWorld(true);let mesh;g.scene.traverse(o=>{if(o.isMesh){if(mesh)throw Error('Unexpected second mesh');mesh=o;}});return mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);}
async function load(id){const entry=manifest.hulls.find(h=>h.id===id);record=inventory.hulls.find(h=>h.id===id);
 [source,prepared]=await Promise.all([raw('./source/'+entry.source),raw('./prepared/fleet/'+id+'.glb')]);source.computeBoundingBox();const box=source.boundingBox,centre=box.getCenter(new THREE.Vector3()),scale=record.miniatureLengthMm/10/(box.max.x-box.min.x);source.translate(-centre.x,-centre.y,-centre.z).scale(scale,scale,scale);source=source.index?source.toNonIndexed():source;source.computeVertexNormals();
 exported=prepared.index?prepared.toNonIndexed():prepared.clone();flat=exported.clone();flat.computeVertexNormals();
 let changed=0,maxAngle=0;const a=exported.attributes.normal,b=flat.attributes.normal;for(let i=0;i<a.count;i++){const angle=Math.acos(THREE.MathUtils.clamp(new THREE.Vector3().fromBufferAttribute(a,i).dot(new THREE.Vector3().fromBufferAttribute(b,i)),-1,1))*180/Math.PI;maxAngle=Math.max(maxAngle,angle);if(angle>1)changed++;}
 paint=preparePaintGeometry(prepared,'VRA',Object.keys(record.regions).map(k=>factionRegion('VRA',k)));
 camera.fov=record.miniatureLengthMm/10/40*180/Math.PI/1.0;camera.updateProjectionMatrix();
 return {id,sourceTriangles:source.attributes.position.count/3,preparedTriangles:exported.attributes.position.count/3,normalCornersChangedOver1Degree:changed,totalCorners:a.count,maximumNormalDeviationDegrees:maxAngle,camera:{position:camera.position.toArray(),fov:camera.fov}};
}
function capture(mode){if(hull){scene.remove(hull);hull.material.dispose();}
 const geometry=mode==='source-flat'?source:mode==='prepared-flat'?flat:mode==='painted'?paint:exported;
 const material=mode==='painted'?candidatePaint('VRA',paint):new THREE.MeshStandardMaterial({color:'#a0a0a0',roughness:.85,metalness:0});
 hull=new THREE.Mesh(geometry,material);scene.add(hull);renderer.render(scene,camera);return {mode,camera:{position:camera.position.toArray(),fov:camera.fov}};
}
window.windowDiagnosis={ready:true,load,capture};
