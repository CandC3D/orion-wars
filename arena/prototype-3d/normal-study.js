import * as THREE from 'three';
import {GLTFLoader} from './vendor/three-r180/loaders/GLTFLoader.js';
const canvas=document.querySelector('canvas'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1200,900,false);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#414141');
scene.add(new THREE.HemisphereLight('#ffffff','#777777',.8));
const key=new THREE.DirectionalLight('#ffffff',3);key.position.set(-25,65,30);scene.add(key);
const material=new THREE.MeshStandardMaterial({color:'#9b9b9b',roughness:.8,metalness:0});
const camera=new THREE.PerspectiveCamera(15,4/3,1,250),geometries=new Map();
let mesh,id,box;
async function geometry(url){if(geometries.has(url))return geometries.get(url);const gltf=await new GLTFLoader().loadAsync(url);gltf.scene.updateMatrixWorld(true);let result;
 gltf.scene.traverse(o=>{if(o.isMesh){if(result)throw Error('Multiple source meshes');result=o.geometry.clone().applyMatrix4(o.matrixWorld);o.geometry.dispose();o.material.dispose();}});geometries.set(url,result);return result;}
async function load(hullId,mode='before'){
 id=hullId;const url=mode==='before'?'./evidence/revision-12/baseline/'+id+'.glb':mode==='after'?'./prepared/fleet/'+id+'.glb':'./evidence/revision-12/candidates/'+mode+'/'+id+'.glb';
 const g=await geometry(url);if(mesh)scene.remove(mesh);mesh=new THREE.Mesh(g,material);scene.add(mesh);g.computeBoundingBox();box=g.boundingBox.clone();return capture('side');
}
function capture(view='side',detail=null){
 const centre=detail?new THREE.Vector3(...detail.centre):box.getCenter(new THREE.Vector3()),length=detail?.width??box.max.x-box.min.x;
 const offset=view==='quarter'?new THREE.Vector3(28,63,44):view==='port'?new THREE.Vector3(0,24,-32):view==='top'?new THREE.Vector3(0,40,.01):new THREE.Vector3(0,24,32);
 camera.position.copy(centre).add(offset);camera.lookAt(centre);camera.fov=2*Math.atan(length/1.333/offset.length()*.60)*180/Math.PI;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 // Swept fighters are wider than their longitudinal length. Fit the complete
 // diagnostic bounds, retaining the same camera for both normal variants.
 if(!detail)for(let i=0;i<3;i++){
  const points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).project(camera));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),ratio=Math.max((Math.max(...xs)-Math.min(...xs))/1.83,(Math.max(...ys)-Math.min(...ys))/1.77);
  if(ratio>1){camera.fov=2*Math.atan(Math.tan(camera.fov*Math.PI/360)*ratio)*180/Math.PI;camera.updateProjectionMatrix();}
 }
 renderer.render(scene,camera);
 return {id,view,detail,camera:{position:camera.position.toArray(),target:centre.toArray(),fov:camera.fov,projection:camera.projectionMatrix.toArray()},triangles:(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3};
}
window.normalStudy={ready:true,load,capture};
