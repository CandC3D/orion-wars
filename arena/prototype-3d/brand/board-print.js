import {BOARD_MARKS} from './board-marks.js';

// Positions are in the existing 1152 × 768 board artwork coordinate system.
// Both supplied aspect ratios are preserved. The component number is stock type.
export const BOARD_BRAND=Object.freeze({ink:'#293b41',registrationInk:'#8d754a',registration:[1.5,.7],
 wordmark:{x:48,y:9,width:302},subtitle:{x:580,y:12,width:524},component:{x:1104,y:67}});
const cache=new Map();
function shape(mark){
 if(!cache.has(mark))cache.set(mark,mark.paths.map(s=>{const path=new Path2D();path.addPath(new Path2D(s.d),new DOMMatrix().translate(s.x,s.y));return {path,rule:s.fillRule};}));return cache.get(mark);
}
// Preserve each source path's fill rule and paint order. Combining separate
// even-odd paths would incorrectly cut holes where their silhouettes overlap.
export function fillBoardMark(c,mark){
 for(const p of shape(mark))c.fill(p.path,p.rule);
}
function print(c,mark,box){
 const [vx,vy,vw]=mark.viewBox,scale=box.width/vw;
 function at(dx,dy,draw){c.save();c.translate(box.x+dx,box.y+dy);c.scale(scale,scale);c.translate(-vx,-vy);draw();c.restore();}
 // Same registration displacement as the grid, restrained on a solid dark title.
 c.save();c.globalAlpha=.25;c.fillStyle=BOARD_BRAND.registrationInk;at(...BOARD_BRAND.registration,()=>fillBoardMark(c,mark));c.restore();
 c.fillStyle=BOARD_BRAND.ink;at(0,0,()=>fillBoardMark(c,mark));
 // A low-density tint impression uses the board's eight-unit dot pitch and phase.
 // Clip to the original outlines; do not erode corners or invent letter detail.
 c.save();at(0,0,()=>{for(const p of shape(mark)){
  c.save();c.clip(p.path,p.rule);c.fillStyle='#223640';c.globalAlpha=.22;
  const firstX=30+Math.ceil((box.x-30)/8)*8,firstY=90+Math.ceil((box.y-90)/8)*8;
  for(let y=firstY;y<box.y+mark.viewBox[3]*scale;y+=8)for(let x=firstX;x<box.x+box.width;x+=8){c.beginPath();c.arc((x-box.x)/scale+vx,(y-box.y)/scale+vy,1.15/scale,0,Math.PI*2);c.fill();}
  c.restore();
 }});c.restore();
}
export function printBoardBrand(c){
 print(c,BOARD_MARKS.wordmark,BOARD_BRAND.wordmark);print(c,BOARD_MARKS.subtitle,BOARD_BRAND.subtitle);
 c.fillStyle=BOARD_BRAND.ink;c.font='15px monospace';c.textAlign='right';c.fillText('SECTOR SHEET 01',BOARD_BRAND.component.x,BOARD_BRAND.component.y);c.textAlign='left';
}
