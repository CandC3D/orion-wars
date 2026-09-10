// Compile the supplied outlined SVGs without changing paths or source files.
// No font, image conversion dependency or asynchronous runtime asset loading.
import fs from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);
function compile(file,requiredGroups){
 const svg=fs.readFileSync(new URL(file,root),'utf8');
 const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
 const header=attrs(svg.match(/<svg\b[^>]*>/)[0]),viewBox=header.viewBox.split(/\s+/).map(Number),stack=[{x:0,y:0,rule:'nonzero',groups:[]}],paths=[],groups=[];
 assert.equal(viewBox.length,4);assert.ok(viewBox.every(Number.isFinite));
 assert.ok(viewBox[2]>0&&viewBox[3]>0);
 for(const k of ['transform','fill','fill-rule','style','stroke','opacity','clip-path','mask'])assert.ok(!header[k],'Unreviewed SVG root property '+k);
 for(const m of svg.matchAll(/<\/?([\w:-]+)\b[^>]*>/g))assert.ok(['svg','title','desc','g','path'].includes(m[1]),'Unsupported SVG element: '+m[1]);
 for(const m of svg.matchAll(/<g\b[^>]*>|<\/g>|<path\b[^>]*\/>/g)){
  if(m[0]==='</g>'){assert.ok(stack.length>1);stack.pop();continue;}
  const a=attrs(m[0]),parent=stack.at(-1);if(a.fill)assert.equal(a.fill.toUpperCase(),'#FFFBEB','Source must remain the supplied single cream fill');
  const state={...parent,groups:[...parent.groups],rule:a['fill-rule']??parent.rule};
  assert.ok(['evenodd','nonzero'].includes(state.rule),'Unreviewed fill rule');
  if(a.transform){const t=a.transform.match(/^translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)$/);assert.ok(t,'Unreviewed SVG transform');state.x+=Number(t[1]);state.y+=Number(t[2]);}
  for(const k of ['style','stroke','opacity','clip-path','mask'])assert.ok(!a[k],'Unreviewed SVG property '+k);
  if(m[0].startsWith('<g')){if(a.id){groups.push(a.id);state.groups.push(a.id);}stack.push(state);}
  else {assert.ok(a.id&&a.d);paths.push({id:a.id,d:a.d,x:state.x,y:state.y,fillRule:state.rule,groups:state.groups});}
 }
 assert.equal(stack.length,1);assert.deepEqual(groups.sort(),[...requiredGroups].sort());assert.equal(paths.length,[...svg.matchAll(/<path\b/g)].length,'Lost a path');assert.ok(paths.length>0);
 return {source:file,sha256:createHash('sha256').update(svg).digest('hex'),viewBox,groups:requiredGroups,paths};
}
const marks={wordmark:compile('distant-sectors-wordmark.svg',['DISTANT','SECTORS','registered-mark']),subtitle:compile('the-achernar-campaign-subtitle.svg',['word-The','word-Achernar','word-Campaign'])};
fs.writeFileSync(new URL('board-marks.js',root),'// Generated from the untouched cream SVGs. Regenerate: node arena/prototype-3d/brand/build-board-marks.mjs\nexport const BOARD_MARKS = '+JSON.stringify(marks,null,2)+';\n');
console.log('Board marks: '+Object.values(marks).map(m=>m.paths.length+' unchanged paths').join(' / '));
