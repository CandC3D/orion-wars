import * as THREE from 'three';
import {patchGeometry} from './hull-paint.js';

// Optional, source-exact Shard insert. No shader or texture from the paint pass.
export function clearInsert(hullGeometry,regions){
  const spec=regions.palette.find(p=>p.key==='46b749');
  if(regions.faction!=='VRA'||spec?.variant?.classification!=='moulded transparent')throw Error('Missing approved clear insert classification');
  const faces=regions.patches.filter(p=>p.region===spec.key).flatMap(p=>p.faces);
  const geometry=patchGeometry(hullGeometry,faces);geometry.computeBoundingBox();
  const b=geometry.boundingBox,position=geometry.attributes.position,depth=new Float32Array(position.count);
  // The authored green insert rises from a nearly horizontal mating plane.
  // Thickness is measured to that plane, not a fictitious enlarged crystal.
  // This is a thin-volume approximation, not a closed-volume ray tracer.
  for(let i=0;i<depth.length;i++)depth[i]=Math.max(.002,position.getY(i)-b.min.y);
  geometry.setAttribute('insertDepth',new THREE.BufferAttribute(depth,1));
  const material=new THREE.MeshPhysicalMaterial({color:0xffffff,metalness:0,roughness:.13,transmission:.96,
    ior:1.57,thickness:1,attenuationColor:new THREE.Color().setRGB(70/255,183/255,73/255),attenuationDistance:.25,
    clearcoat:.15,clearcoatRoughness:.10,emissive:0,emissiveIntensity:0,transparent:false,opacity:1});
  material.name='Shard / optional moulded clear green styrene';material.userData.register='physical';
  material.userData.classification='moulded transparent';
  // transmission_fragment is expanded by Three after onBeforeCompile.
  material.onBeforeCompile=s=>{
    s.vertexShader='attribute float insertDepth; varying float vInsertDepth;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvInsertDepth=insertDepth;');
    s.fragmentShader='varying float vInsertDepth;\n'+s.fragmentShader;
    const chunk=THREE.ShaderChunk.transmission_fragment;
    if(!chunk.includes('material.thickness = thickness;'))throw Error('Pinned transmission contract changed');
    s.fragmentShader=s.fragmentShader.replace('#include <transmission_fragment>',chunk.replace('material.thickness = thickness;','material.thickness = vInsertDepth;'));
  };
  material.customProgramCacheKey=()=> 'source-green-thickness-styrene-v1';
  const mesh=new THREE.Mesh(geometry,material);mesh.name=material.name;mesh.userData.register='physical';mesh.castShadow=mesh.receiveShadow=true;mesh.visible=false;
  mesh.userData.evidence={sourceRegion:spec.key,triangles:faces.length,sizeMm:b.getSize(new THREE.Vector3()).toArray().map(n=>n*10),
    minThicknessMm:Math.min(...depth)*10,maxThicknessMm:Math.max(...depth)*10,approximation:'depth to authored mating plane; opaque shadow; no closed-volume multiple scattering'};
  return mesh;
}
