import * as THREE from 'three';

// Capture only the already-lit physical tabletop, before adding the miniatures.
// Rough-filtered room return supplies metal/plastic reflections; no added light,
// painted highlights in an environment image, or new visible furniture.
export function tabletopReflections(renderer,scene){
  const target=new THREE.WebGLCubeRenderTarget(128,{type:THREE.HalfFloatType});
  const cube=new THREE.CubeCamera(.1,150,target);cube.position.set(0,8,0);
  cube.update(renderer,scene);
  const pmrem=new THREE.PMREMGenerator(renderer),filtered=pmrem.fromCubemap(target.texture);
  target.dispose();pmrem.dispose();
  filtered.texture.userData.byteLength=filtered.width*filtered.height*8;
  return filtered;
}
