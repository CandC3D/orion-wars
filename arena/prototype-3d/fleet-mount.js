import * as THREE from 'three';
import {BOARD,SIZES,mm} from './scale.js';
import {baseGeometry,postGeometry,BASE_APEX} from './stands.js';
import {physicalMesh,physicalMaterial} from './materials.js';
import {plasticMaterial,transmittingShadow,maskInsertShadow} from './moulded-plastic.js';
import {clearInsert} from './clear-insert.js';
import {classRim} from './rim-labels.js';

export function mountFleetHull(entry,geometry,paint,map,reflection){
 const group=new THREE.Group(),hulls=new THREE.Group();group.add(hulls);
 const black=physicalMaterial('black cast FASA base',{color:'#151513',roughness:.86});
 const base=physicalMesh('black FASA base / cast arc-2 triangle',baseGeometry(),black);base.position.y=BOARD.top;group.add(base);
 const clear=plasticMaterial({name:'approved clear tapered styrene post',post:true});clear.envMap=reflection;clear.envMapIntensity=.6;
 const post=physicalMesh('uniform clear post',postGeometry(),clear);transmittingShadow(post,.10);post.position.y=BOARD.top+BASE_APEX+mm(SIZES.postHeight/2);group.add(post);
 const rim=classRim(entry.code);if(rim){rim.position.y=BOARD.top;group.add(rim);}
 const probe=new THREE.Mesh(geometry,paint);probe.updateMatrixWorld(true);
 const hit=new THREE.Raycaster(new THREE.Vector3(0,-30,0),new THREE.Vector3(0,1,0)).intersectObject(probe,false)[0];if(!hit)throw Error('No underside attachment: '+entry.id);
 const supportTop=BOARD.top+BASE_APEX+mm(SIZES.postHeight),offsetY=supportTop-hit.point.y;
 geometry.computeBoundingBox();const size=geometry.boundingBox.getSize(new THREE.Vector3()),count=entry.flight?.count??1;
 if(count!==1&&count!==6)throw Error('Only approved six-craft flights');
 const dx=size.x+mm(2),dz=size.z+mm(2),positions=count===6?[-dx,0,dx].flatMap(x=>[[x,-dz/2],[x,dz/2]]):[[0,0]],crystals=[];
 for(const [index,[x,z]] of positions.entries()){
  const hull=physicalMesh(entry.name+' / craft '+(index+1),geometry,paint);hull.position.set(x,offsetY,z);hulls.add(hull);
  if(entry.faction==='VRA'){
   maskInsertShadow(hull);paint.userData.clearVariant.value=1;
   const insert=clearInsert(geometry,map);insert.material.envMap=reflection;insert.material.envMapIntensity=.6;hull.add(insert);crystals.push(insert);
  }
 }
 let frame=null;
 if(count===6){
  frame=new THREE.Group();group.add(frame);
  // One clear moulded sprue-like support: a spine and three paired arms. The
  // top of each 0.8 mm bar meets the actual underside of both supported craft.
  const plastic=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.095,metalness:0,transmission:1,ior:1.57,thickness:.08,attenuationColor:new THREE.Color(.96,.985,1),attenuationDistance:3,transparent:false,emissive:0,emissiveIntensity:0,envMap:reflection,envMapIntensity:.6});
  plastic.userData.register='physical';plastic.userData.classification='moulded transparent';plastic.name='clear moulded flight frame';
  const rod=(a,b)=>{const v=new THREE.Vector3().subVectors(b,a),mesh=physicalMesh('clear formation arm',new THREE.CylinderGeometry(.04,.04,v.length()+.08,12),plastic);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());transmittingShadow(mesh,.10);frame.add(mesh);};
  const y=supportTop-.04;rod(new THREE.Vector3(-dx,y,0),new THREE.Vector3(dx,y,0));
  for(const x of [-dx,0,dx])rod(new THREE.Vector3(x,y,-dz/2),new THREE.Vector3(x,y,dz/2));
 }
 group.updateMatrixWorld(true);
 return {group,hulls,post,base,rim,frame,crystals,aircraft:count,singleCraftLengthMm:size.x*10,positions,supportTop,attachment:hit.point.clone()};
}
