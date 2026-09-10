import * as THREE from 'three';
import { physicalMaterial, physicalMesh, canvasTexture, boardTexture, woodTexture, coverTexture } from './materials.js';
import { MM_PER_UNIT, mm, SIZES, BOARD, validateScaleRows } from './scale.js';
export { BOARD } from './scale.js';

export function buildTable(scene) {
  const rows=[];
  const measure=(object,root,referenceMm,basis='local X / Y / Z extents')=>{
    root.updateMatrixWorld(true);
    const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    rows.push({object,basis,sceneUnits:size.toArray(),actualMm:size.toArray().map(n=>n*MM_PER_UNIT),referenceMm});
  };
  const mesh=(name,g,m,parent=scene)=>{const o=physicalMesh(name,g,m);parent.add(o);return o;};
  const box=(name,size,m,parent=scene)=>mesh(name,new THREE.BoxGeometry(...size.map(mm)),m,parent);
  const wood=physicalMaterial('walnut veneer',{map:woodTexture(),roughness:.70});
  const table=box('table / solid edge',SIZES.table,wood);measure('Tabletop',table,SIZES.table);table.position.y=-mm(SIZES.table[1])/2;
  const card=physicalMaterial('cardboard edges',{color:'#ab9674',roughness:.95});
  const board=box('board / folded card',SIZES.board,card);measure('Board card',board,SIZES.board);board.position.y=BOARD.top/2;
  const surface=mesh('board / offset printed paper',new THREE.PlaneGeometry(BOARD.width,BOARD.depth),physicalMaterial('two spot inks on paper',{map:boardTexture(),roughness:.94}));
  surface.rotation.x=-Math.PI/2;surface.position.y=BOARD.top+.005;
  rows.push({object:'Printed hex',basis:'across flats',sceneUnits:[mm(SIZES.hexAcrossFlats)],actualMm:[SIZES.hexAcrossFlats],referenceMm:[32]});

  const printedCover=coverTexture();
  const cover=physicalMaterial('cloth hardback',{color:'#27434a',roughness:.87});
  const pages=physicalMaterial('cream page edges',{color:'#cec2a1',roughness:.98});
  const book=new THREE.Group();scene.add(book);
  const lower=box('rulebook / lower cover',[216,3,279],cover,book);lower.position.y=.15;
  const paperBlock=box('rulebook / page block',[212,22,275],pages,book);paperBlock.position.y=1.4;
  const upper=box('rulebook / upper cover',[216,3,279],cover,book);upper.position.y=2.65;
  measure('Hardback rulebook',book,SIZES.rulebook);
  const art=mesh('rulebook / printed cover',new THREE.PlaneGeometry(21.2,27.5),physicalMaterial('painted first edition cover',{map:printedCover,roughness:.86}),book);art.rotation.x=-Math.PI/2;art.position.y=2.805;
  book.position.set(-36,0,4.5);book.rotation.y=.05;

  const lid=new THREE.Group();scene.add(lid);
  const lidTop=box('box lid / printed cardboard',[250,2,190],cover,lid);lidTop.position.y=2.9;
  for(const x of [-12.4,12.4]){const side=box('box lid / side',[2,28,190],card,lid);side.position.set(x,1.4,0);}
  for(const z of [-9.4,9.4]){const side=box('box lid / end',[246,28,2],card,lid);side.position.set(0,1.4,z);}
  measure('Box lid',lid,[250,30,190]);
  const lidArt=mesh('box lid / cover illustration',new THREE.PlaneGeometry(24.8,18.8),physicalMaterial('box art on paper',{map:printedCover,roughness:.94}),lid);lidArt.rotation.x=-Math.PI/2;lidArt.position.y=3.005;
  lid.position.set(-36.5,0,-21.5);

  const mug=new THREE.Group();scene.add(mug);
  const ceramic=physicalMaterial('cream glazed stoneware',{color:'#c4bd9d',roughness:.29});
  const profile=[[31,0],[36,2],[38,8],[40,90],[40,95],[35,95],[34,13],[0,10]].map(([x,y])=>new THREE.Vector2(mm(x),mm(y)));
  const body=mesh('mug / stoneware body',new THREE.LatheGeometry(profile,48),ceramic,mug);measure('Mug body',body,SIZES.mugBody);
  const handle=mesh('mug / loop handle',new THREE.TorusGeometry(2.25,.55,12,40),ceramic,mug);handle.position.set(4.4,4.6,0);
  measure('Mug including handle',mug,SIZES.mugWithHandle);
  const coffee=mesh('mug / coffee',new THREE.CircleGeometry(3.48,48),physicalMaterial('coffee surface',{color:'#24140c',roughness:.28}),mug);coffee.rotation.x=-Math.PI/2;coffee.position.y=8.2;
  mug.position.set(32,0,-19);

  const d20Texture=canvasTexture(640,512,(c,w,h)=>{
    c.fillStyle='#bea877';c.fillRect(0,0,w,h);c.fillStyle='#302a20';c.textAlign='center';c.textBaseline='middle';c.font='bold 41px Georgia';
    for(let i=0;i<20;i++)c.fillText(String(i+1),(i%5+.5)*128,(Math.floor(i/5)+.60)*128);
  });
  const d20Geo=new THREE.IcosahedronGeometry(mm(SIZES.d20VertexDiameter)/2,0),uv=d20Geo.getAttribute('uv');
  for(let i=0;i<20;i++)for(let j=0;j<3;j++){const t=[[.08,.12],[.92,.12],[.5,.88]][j];uv.setXY(i*3+j,((i%5)+t[0])/5,1-(Math.floor(i/5)+t[1])/4);}
  const die=mesh('die / twenty numbered faces',d20Geo,physicalMaterial('ochre plastic',{map:d20Texture,roughness:.52}));
  const normal=new THREE.Vector3().fromBufferAttribute(d20Geo.attributes.normal,0);
  die.quaternion.setFromUnitVectors(normal,new THREE.Vector3(0,-1,0));die.updateMatrixWorld(true);
  die.position.set(28,-new THREE.Box3().setFromObject(die).min.y,1.5);
  const positions=d20Geo.attributes.position;let diameter=0;
  for(let i=0;i<positions.count;i++)for(let j=i+1;j<positions.count;j++)diameter=Math.max(diameter,new THREE.Vector3().fromBufferAttribute(positions,i).distanceTo(new THREE.Vector3().fromBufferAttribute(positions,j)));
  rows.push({object:'D20',basis:'maximum opposite-vertex distance',sceneUnits:[diameter],actualMm:[diameter*10],referenceMm:[20]});
  const pips={1:[[1,1]],2:[[0,0],[2,2]],3:[[0,0],[1,1],[2,2]],4:[[0,0],[2,0],[0,2],[2,2]],5:[[0,0],[2,0],[1,1],[0,2],[2,2]],6:[[0,0],[0,1],[0,2],[2,0],[2,1],[2,2]]};
  const diceMaterials=[1,6,2,5,3,4].map(n=>physicalMaterial(`red die / face ${n}`,{roughness:.57,map:canvasTexture(128,128,c=>{
    c.fillStyle='#81352e';c.fillRect(0,0,128,128);c.fillStyle='#eddfbd';for(const [x,y] of pips[n]){c.beginPath();c.arc(30+x*34,30+y*34,7,0,Math.PI*2);c.fill();}
  })}));
  const cube=box('die / six-sided',Array(3).fill(SIZES.d6),diceMaterials);measure('D6',cube,[16,16,16]);cube.position.set(31,.8,4.2);cube.rotation.y=.38;

  const note=new THREE.Group();scene.add(note);
  const back=box('notebook / card back',[216,1.5,279],card,note);back.position.y=.075;
  const leaves=box('notebook / paper block',[216,4.5,279],pages,note);leaves.position.y=.375;
  measure('Spiral notebook body',note,SIZES.notebook);
  const sheet=canvasTexture(512,768,(c,w,h)=>{
    c.fillStyle='#d4cdb0';c.fillRect(0,0,w,h);c.strokeStyle='#9ea6a3';c.lineWidth=1;
    for(let y=115;y<h;y+=48){c.beginPath();c.moveTo(64,y);c.lineTo(w-28,y);c.stroke();}
    c.strokeStyle='#b88b84';c.beginPath();c.moveTo(76,0);c.lineTo(76,h);c.stroke();
    c.fillStyle='#676457';c.font='italic 26px Georgia';c.fillText('Achernar — ship records',96,78);
    c.font='italic 23px Georgia';['EDS / frigate','hull      12 / 12','power     18','Turn 1 — hold course','','IKS / contact east','bearing confirmed',''].forEach((s,i)=>c.fillText(s,98,157+i*48));
  });
  const noteFace=mesh('notebook / pencilled record',new THREE.PlaneGeometry(21.6,27.9),physicalMaterial('ruled paper',{map:sheet,roughness:.98}),note);noteFace.rotation.x=-Math.PI/2;noteFace.position.y=.605;
  const rings=new THREE.InstancedMesh(new THREE.TorusGeometry(.30,.045,6,12),physicalMaterial('spiral wire',{color:'#6f706b',metalness:.65,roughness:.4}),26);
  rings.name='notebook / spiral wire';rings.userData.register='physical';rings.castShadow=rings.receiveShadow=true;
  const dummy=new THREE.Object3D();for(let i=0;i<26;i++){dummy.position.set(-10.65,.40,-13.1+i*1.05);dummy.rotation.y=0;dummy.updateMatrix();rings.setMatrixAt(i,dummy.matrix);}note.add(rings);
  note.position.set(36,0,18.5);

  const pencil=new THREE.Group();scene.add(pencil);
  const shaft=mesh('pencil / hexagonal enamel shaft',new THREE.CylinderGeometry(.35,.35,17.4,6),physicalMaterial('yellow pencil enamel',{color:'#b89839'}),pencil);shaft.position.y=.8;
  const tip=mesh('pencil / sharpened wood',new THREE.CylinderGeometry(.35,.06,1.5,6),physicalMaterial('exposed pencil wood',{color:'#b49260'}),pencil);tip.position.y=-8.65;
  const lead=mesh('pencil / graphite point',new THREE.CylinderGeometry(.06,0,.1,6),physicalMaterial('graphite',{color:'#35332c',roughness:.6}),pencil);lead.position.y=-9.45;
  measure('Pencil',pencil,[Math.sqrt(3)*3.5,190,7]);
  pencil.rotation.set(Math.PI/2,0,-.38);pencil.position.set(38,1,20);
  scene.userData.scaleRows=validateScaleRows(rows);
  return scene.userData.scaleRows;
}
