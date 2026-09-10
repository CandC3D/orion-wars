import * as THREE from 'three';
import { assertRegister, BUDGETS } from './contract.js';
import { BOARD } from './scale.js';
import {printBoardBrand} from './brand/board-print.js';

export function physicalMaterial(name, options = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, ...options,
    transparent: false, opacity: 1, emissive: 0x000000, emissiveIntensity: 0 });
  m.name = name; m.userData.register = 'physical';
  return m;
}
export function physicalMesh(name, geometry, material) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name; m.userData.register = 'physical'; m.castShadow = m.receiveShadow = true;
  return m;
}
export function validateScene(scene) {
  let drawables = 0;
  scene.traverse(o => {
    if (o.isLight && scene.userData.register === 'energetic') throw new Error('Energetic scene cannot contain a light');
    if (!o.isMesh && !o.isLine && !o.isSprite && !o.isPoints) return;
    drawables++;
    assertRegister(o.userData.register, o.name || 'drawable');
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      assertRegister(m?.userData.register, m?.name || 'material');
      if (m.userData.register !== o.userData.register) throw new Error(`Mixed registers: ${o.name}`);
      if (m.userData.register === 'physical') {
        if (!m.isMeshStandardMaterial || m.transparent || !m.depthWrite || m.emissiveMap || m.emissive?.getHex() || !o.castShadow || !o.receiveShadow)
          throw new Error(`Physical material/depth/shadow violation: ${o.name}`);
      } else if (!m.isShaderMaterial || m.lights || m.blending !== THREE.AdditiveBlending || m.depthWrite || o.castShadow || o.receiveShadow || m.toneMapped) {
        throw new Error(`Energetic material/depth/shadow violation: ${o.name}`);
      }
    }
  });
  return drawables;
}

export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function boardTexture() {
  // Rasterise the original vector cuts directly at 4/3 the previous resolution.
  // Keep print geometry in its original coordinates and stay inside 24 MiB.
  return canvasTexture(1536, 1024, (c) => {
    c.scale(4/3,4/3);const w=1152,h=768;
    c.fillStyle='#d9cdae';c.fillRect(0,0,w,h);
    c.fillStyle='#253b45';c.fillRect(28,86,w-56,h-126);
    // Two spot inks, stippled tints and a deliberately displaced registration impression.
    c.fillStyle='#3c5962';c.beginPath();c.ellipse(w*.70,h*.45,250,280,.4,0,Math.PI*2);c.fill();
    c.fillStyle='#223640';
    for(let y=90;y<h-40;y+=8)for(let x=30;x<w-25;x+=8){c.beginPath();c.arc(x,y,1.15,0,Math.PI*2);c.fill();}
    const sx=w/BOARD.width,sy=h/BOARD.depth,hex=BUDGETS.hexRadius;
    for(let r=-8;r<=8;r++)for(let q=-12;q<=12;q++){
      const x=w/2+Math.sqrt(3)*hex*(q+r/2)*sx,y=h/2+1.5*hex*r*sy;
      if(x<55||x>w-55||y<112||y>h-60)continue;
      const outline=(ox,oy,colour)=>{c.strokeStyle=colour;c.lineWidth=1.25;c.beginPath();
        for(let i=0;i<7;i++){const a=(30+i*60)*Math.PI/180,px=x+Math.cos(a)*hex*sx+ox,py=y+Math.sin(a)*hex*sy+oy;i?c.lineTo(px,py):c.moveTo(px,py);}c.stroke();};
      outline(1.5,.7,'#8d754a');outline(0,0,'#718586');
      c.fillStyle='#8c9d98';c.font='12px monospace';c.fillText(`${q+8}${String(r+6).padStart(2,'0')}`,x-10,y+hex*sy*.70);
    }
    printBoardBrand(c);
    c.fillStyle='#b49b68';c.font='15px monospace';c.fillText('ACHERNAR APPROACH     •     TACTICAL HEXES',56,122);
    c.fillStyle='#293b41';c.font='12px monospace';c.fillText('PRINTED SECTOR BOARD  •  1987     /     FOLD FLAT BEFORE PLAY',45,h-16);
    // A folded card has a worn light edge and a darker trough, not a mountainous bump map.
    for(const x of [w/3,w*2/3]){c.fillStyle='rgba(12,19,19,.23)';c.fillRect(x-1,4,3,h-8);c.fillStyle='rgba(231,218,181,.23)';c.fillRect(x+2,4,2,h-8);}
    c.fillStyle='rgba(223,217,189,.17)';c.fillRect(28,h/2, w-56,2);
  });
}

export function woodTexture() {
  return canvasTexture(512,512,(c,w,h)=>{
    c.fillStyle='#7c5133';c.fillRect(0,0,w,h);
    for(let i=0;i<420;i++){
      const y=i/420*h;c.strokeStyle=`rgba(${i%3?35:220},${i%3?22:164},${i%3?15:103},${.05+(i%7)*.009})`;
      c.lineWidth=.8+(i%5)*.3;c.beginPath();c.moveTo(0,y);
      for(let x=0;x<=w;x+=24)c.lineTo(x,y+Math.sin(x*.008+i*.2)*(3+i%7));c.stroke();
    }
    c.fillStyle='rgba(29,15,8,.36)';for(const y of [255,510,767])c.fillRect(0,y,w,3);
  });
}

export function coverTexture() {
  return canvasTexture(512,768,(c,w,h)=>{
    c.fillStyle='#304e58';c.fillRect(0,0,w,h);c.strokeStyle='#c6b28c';c.lineWidth=3;c.strokeRect(20,20,w-40,h-40);
    c.fillStyle='#e3d3ad';c.textAlign='center';c.font='bold 48px Georgia';c.fillText('DISTANT',w/2,110);c.fillText('SECTORS',w/2,164);
    c.font='18px Georgia';c.fillText('THE ACHERNAR CAMPAIGN',w/2,207);
    // Broad painted cover shapes, not modern rendered cover art.
    c.fillStyle='#a97540';c.beginPath();c.arc(160,420,115,0,Math.PI*2);c.fill();
    c.fillStyle='#c9a570';c.beginPath();c.ellipse(157,387,99,30,-.2,0,Math.PI*2);c.fill();
    c.fillStyle='#d8d0af';c.beginPath();c.moveTo(120,545);c.lineTo(370,320);c.lineTo(324,496);c.lineTo(250,489);c.closePath();c.fill();
    c.fillStyle='#405d70';c.beginPath();c.moveTo(160,526);c.lineTo(359,348);c.lineTo(285,478);c.closePath();c.fill();
    c.fillStyle='#e3d3ad';c.font='25px Georgia';c.fillText('FLEET RULES',w/2,664);c.font='15px monospace';c.fillText('FIRST EDITION  •  1987',w/2,701);
  });
}
