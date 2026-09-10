import * as THREE from 'three';
import { physicalMaterial, physicalMesh, canvasTexture, boardTexture, woodTexture, coverTexture } from './materials.js';

export const BOARD = Object.freeze({ width: 25, depth: 18, top: 0.12 });
export function buildTable(scene) {
  const add = (name,geometry,material,x,y,z,rotation=0) => {
    const o=physicalMesh(name,geometry,material);o.position.set(x,y,z);o.rotation.y=rotation;scene.add(o);return o;
  };
  const tabletop=physicalMaterial('worn walnut veneer',{map:woodTexture(),roughness:.66});
  add('table / solid visible edge',new THREE.BoxGeometry(37,.65,29),tabletop,0,-.40,0);
  const card=physicalMaterial('folded card edge',{color:'#a18c69'});
  add('board / card thickness',new THREE.BoxGeometry(BOARD.width,.18,BOARD.depth),card,0,.02,0);
  const surface=add('board / offset printed paper',new THREE.PlaneGeometry(25,18),physicalMaterial('two spot inks on paper',{map:boardTexture(),roughness:.94}),0,BOARD.top,0);
  surface.rotation.x=-Math.PI/2;

  const cover=physicalMaterial('cloth hardback cover',{color:'#27434a',roughness:.87});
  const pages=physicalMaterial('cream book pages',{color:'#cec2a1',roughness:.98});
  const book=new THREE.Group();book.position.set(-14,.15,2.6);book.rotation.y=.16;scene.add(book);
  const badd=(name,g,m,y)=>{const o=physicalMesh(name,g,m);o.position.y=y;book.add(o);return o;};
  badd('rulebook / lower board',new THREE.BoxGeometry(4.3,.13,6.2),cover,0);
  badd('rulebook / page block',new THREE.BoxGeometry(4.06,.40,5.96),pages,.25);
  badd('rulebook / upper board',new THREE.BoxGeometry(4.3,.13,6.2),cover,.50);
  const art=badd('rulebook / printed first edition cover',new THREE.PlaneGeometry(4.16,6.06),physicalMaterial('painted cover illustration',{map:coverTexture(),roughness:.88}),.571);art.rotation.x=-Math.PI/2;

  const mug=new THREE.Group();mug.position.set(13.4,.08,-5.9);scene.add(mug);
  const porcelain=physicalMaterial('cream glazed stoneware',{color:'#b7b19a',roughness:.32});
  const profile=[[.63,0],[.78,.10],[.84,1.5],[.80,1.57],[.73,1.55],[.69,.23],[0,.20]].map(p=>new THREE.Vector2(...p));
  mug.add(physicalMesh('mug / heavy stoneware',new THREE.LatheGeometry(profile,28),porcelain));
  const handle=physicalMesh('mug / loop handle',new THREE.TorusGeometry(.57,.14,8,20),porcelain);handle.position.set(.88,.82,0);mug.add(handle);
  const coffee=physicalMesh('mug / coffee',new THREE.CircleGeometry(.715,28),physicalMaterial('coffee surface',{color:'#20150e',roughness:.37}));coffee.rotation.x=-Math.PI/2;coffee.position.y=1.34;mug.add(coffee);

  const diceTexture=canvasTexture(640,512,(c,w,h)=>{
    c.fillStyle='#b6a06a';c.fillRect(0,0,w,h);c.fillStyle='#302a20';c.textAlign='center';c.textBaseline='middle';c.font='bold 41px Georgia';
    for(let i=0;i<20;i++)c.fillText(String(i+1),(i%5+.5)*128,(Math.floor(i/5)+.60)*128);
  });
  const diceGeo=new THREE.IcosahedronGeometry(.70,0),uv=diceGeo.getAttribute('uv');
  for(let i=0;i<20;i++)for(let j=0;j<3;j++){
    const tri=[[.08,.12],[.92,.12],[.5,.88]][j];uv.setXY(i*3+j,((i%5)+tri[0])/5,1-(Math.floor(i/5)+tri[1])/4);
  }
  const die=add('die / numbered polyhedral plastic',diceGeo,physicalMaterial('ochre die',{map:diceTexture,roughness:.51}),12.7,.65,4.0);
  die.rotation.set(.33,.62,.21);
  const pipTexture=canvasTexture(256,256,c=>{
    c.fillStyle='#7a3029';c.fillRect(0,0,256,256);c.fillStyle='#e6d5aa';
    for(const [x,y] of [[64,64],[192,64],[128,128],[64,192],[192,192]]){c.beginPath();c.arc(x,y,15,0,Math.PI*2);c.fill();}
  });
  const cube=add('die / red five',new THREE.BoxGeometry(.78,.78,.78),physicalMaterial('red plastic and recessed ivory pips',{map:pipTexture,roughness:.60}),14.3,.42,2.8);cube.rotation.y=.38;

  const paper=canvasTexture(512,512,(c,w,h)=>{
    c.fillStyle='#c9c4a7';c.fillRect(0,0,w,h);c.strokeStyle='#929e9c';c.lineWidth=1;
    for(let y=75;y<h;y+=37){c.beginPath();c.moveTo(44,y);c.lineTo(w-25,y);c.stroke();}
    c.fillStyle='#5d5b50';c.font='italic 23px Georgia';c.fillText('Achernar — ship records',55,49);
    c.font='italic 18px Georgia';['EDS   /   frigate','hull      12     /     12','power    18','Turn 1   — hold course','IKS   /   contact east',''].forEach((s,i)=>c.fillText(s,55,105+i*37));
  });
  add('notebook / cardboard back',new THREE.BoxGeometry(4.3,.11,4.0),card,9.4,.06,11.3,.08);
  const note=add('notebook / pencilled paper',new THREE.PlaneGeometry(4.2,3.9),physicalMaterial('ruled paper',{map:paper,roughness:.95}),9.4,.13,11.3,.08);note.rotation.x=-Math.PI/2;
  const rings=new THREE.InstancedMesh(new THREE.TorusGeometry(.16,.032,6,12),physicalMaterial('notebook wire',{color:'#918b74',metalness:.65,roughness:.4}),9);
  rings.name='notebook / spiral wire';rings.userData.register='physical';rings.castShadow=rings.receiveShadow=true;
  const m=new THREE.Object3D();for(let i=0;i<9;i++){m.position.set(7.33,.17,9.65+i*.40);m.rotation.y=Math.PI/2;m.updateMatrix();rings.setMatrixAt(i,m.matrix);}scene.add(rings);
  const pencil=add('pencil / painted hexagonal wood',new THREE.CylinderGeometry(.075,.075,3.5,6),physicalMaterial('pencil enamel',{color:'#b29442'}),12.3,.2,10.7);pencil.rotation.set(Math.PI/2,0,-.22);
}
