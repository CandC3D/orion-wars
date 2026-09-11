import fs from 'node:fs';
import {readGLB,colourKey} from './glb-data.mjs';
import {artProfile} from './hull-art.js';
import {validateFactionPalette,factionRegion} from './faction-palettes.js';
const here=new URL('./',import.meta.url);
const configs=JSON.parse(fs.readFileSync(new URL('./hull-sources.json',here)));
const comparison=process.argv.includes('--comparison');
const fleet=process.argv.includes('--fleet');
const faction=process.argv[2]??'KRE',config=fleet?JSON.parse(fs.readFileSync(new URL('./prepared/fleet/inventory.json',here))).hulls.find(h=>h.id===process.argv[process.argv.indexOf('--fleet')+1]).config:comparison?JSON.parse(fs.readFileSync(new URL('./comparison-source.json',here))):configs[faction];
const profile=comparison||fleet?{palette:Object.keys(config.colours).map(k=>factionRegion(faction,k)),confirmedEffects:config.pointDefence?['pointDefenceEmitter']:[]}:artProfile(faction);
const source=readGLB(new URL('./source/'+config.source,here));
const sp=source.json.meshes[0].primitives[0],sc=source.attribute(sp.attributes.COLOR_0);
const palette=[];
for(const c of sc){const key=colourKey(c);let p=palette.find(p=>p.key===key);if(!p){p={key,rgb:c.slice(0,3),sourceVertices:0};palette.push(p);}p.sourceVertices++;}
validateFactionPalette(faction,palette.map(p=>p.key),{expectedKeys:Object.keys(config.colours),context:config.source});
const sourcePositions=source.attribute(sp.attributes.POSITION);
for(const [key,b] of Object.entries(config.materialBounds??{}))for(let i=0;i<sc.length;i++)if(colourKey(sc[i])===key&&sourcePositions[i].some((v,k)=>v<b.sourceMin[k]||v>b.sourceMax[k]))throw Error(key+' outside '+b.role+'; report source disagreement');
const outputFolder=fleet?'./prepared/fleet/':'./prepared/';
const glb=readGLB(new URL(outputFolder+config.output+'.glb',here)),p=glb.json.meshes[0].primitives[0];
const positions=glb.attribute(p.attributes.POSITION),colours=glb.attribute(p.attributes.COLOR_0),indices=glb.attribute(p.indices).flat();
const nearest=c=>palette.reduce((best,p,i)=>{const d=p.rgb.reduce((n,x,k)=>n+(x-c[k])**2,0);return d<best.d?{i,d}:best;},{d:Infinity}).i;
const key=v=>v.map(n=>Math.round(n*1e6)).join(','),edges=new Map(),faces=[];
for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),region=nearest(colours[ids[0]]);
 if(ids.some(id=>nearest(colours[id])!==region))throw Error('Mixed triangle');
 const f={ids,region,neighbours:[]};faces.push(f);for(let j=0;j<3;j++){const e=[key(positions[ids[j]]),key(positions[ids[(j+1)%3]])].sort().join('|'),other=edges.get(e);
 if(other!==undefined&&faces[other].region===region){f.neighbours.push(other);faces[other].neighbours.push(faces.length-1);}else edges.set(e,faces.length-1);}
}
const seen=new Set(),patches=[];
for(let i=0;i<faces.length;i++){if(seen.has(i))continue;const todo=[i],ids=[];seen.add(i);while(todo.length){const n=todo.pop();ids.push(n);for(const k of faces[n].neighbours)if(!seen.has(k)){seen.add(k);todo.push(k);}}
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const n of ids)for(const id of faces[n].ids)for(let k=0;k<3;k++){min[k]=Math.min(min[k],positions[id][k]);max[k]=Math.max(max[k],positions[id][k]);}
 patches.push({region:palette[faces[i].region].key,triangles:ids.length,min,max,faces:ids});
}
patches.sort((a,b)=>a.region.localeCompare(b.region)||b.triangles-a.triangles);
for(const [key,b] of Object.entries(config.materialBounds??{}))if(b.preparedMin&&b.preparedMax)for(const p of patches.filter(p=>p.region===key))if(p.min.some((v,k)=>v<b.preparedMin[k])||p.max.some((v,k)=>v>b.preparedMax[k]))throw Error(key+' outside prepared '+b.role);
// The v2 plate identifies a vertical orange stern exhaust and the larger yellow
// dorsal dome. Each selector must match one actual connected source-colour patch.
const select=(label,predicate)=>{const found=patches.filter(predicate);if(found.length!==1)throw Error('Re-author semantic region: '+label);return {...found[0],register:'energetic',anatomy:label};};
const features=!fleet&&faction==='KRE'?{
  exhaust:select('vertical stern exhaust',p=>p.region==='f5831f'&&p.max[0]<-config.lengthMm/10*.44&&p.min[1]>.02),
  beamEmitter:select('larger dorsal emitter',p=>p.region==='ffdd1a'&&p.min[0]>0&&p.min[1]>0&&p.max[0]-p.min[0]>.03*config.lengthMm/10)
}:!fleet&&faction==='EAR'?{
  exhaust:select('red insert in the aft nacelle outlet',p=>p.region==='e91d2d'&&p.max[0]<-2.7&&p.min[1]>1),
  beamEmitter:select('forward laser muzzle inside the orange warning housing',p=>p.region==='e91d2d'&&p.min[0]>1.89&&p.max[0]<1.90&&p.min[1]>.85&&p.max[1]<1.01)
}:{};
// Only four positively matched smaller dorsal domes: same source diameter
// (2.20 units) and hemisphere profile, unlike 3.46-unit primary beam domes.
if(faction==='KRE'&&(config.pointDefence||!fleet&&!comparison)){
 const bounds=source.json.accessors[sp.attributes.POSITION],axis=config.nativeBow.endsWith('Y')?1:0;
 const sourceScale=(bounds.max[axis]-bounds.min[axis])/(config.lengthMm/10);
 features.pointDefenceEmitter=select('point-defence emitter / smaller dorsal dome',p=>{
  const d=p.min.map((n,k)=>p.max[k]-n),diameter=Math.max(d[0],d[2])*sourceScale;
  return p.region==='ffdd1a'&&p.min[1]>0&&diameter>2.15&&diameter<2.25&&d[1]/d[0]>.45&&d[1]/d[0]<.56&&Math.abs(d[0]/d[2]-1)<.03;
 });
 const e=features.pointDefenceEmitter;e.socket=[(e.min[0]+e.max[0])/2,e.max[1]+.018,(e.min[2]+e.max[2])/2];e.role='point-defence';e.enabledByDefault=false;e.evidence='Chris smaller-dome ruling; 2.20 source-unit hemisphere, verified on Sparrowhawk, Swift, Ballista and Raptor';
}
if(features.beamEmitter){const e=features.beamEmitter;e.socket=e.min.map((n,k)=>(n+e.max[k])/2);e.socket[faction==='KRE'?1:0]=e.max[faction==='KRE'?1:0]+.018;}
for(const f of Object.values(features))f.colour='#'+f.region;
function coverage(glb){
  const primitive=glb.json.meshes[0].primitives[0],p=glb.attribute(primitive.attributes.POSITION),c=glb.attribute(primitive.attributes.COLOR_0),ids=glb.attribute(primitive.indices).flat(),areas=Array(palette.length).fill(0);
  for(let i=0;i<ids.length;i+=3){const [a,b,d]=ids.slice(i,i+3).map(i=>p[i]),u=b.map((v,k)=>v-a[k]),v=d.map((v,k)=>v-a[k]);
    const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
    areas[nearest(c[ids[i]])]+=area;
  }
  const total=areas.reduce((a,b)=>a+b,0);return Object.fromEntries(palette.map((p,i)=>[p.key,areas[i]/total]));
}
const sourceCoverage=coverage(source),derivativeCoverage=coverage(glb);
const energyAttachments={};
for(const p of palette){
 const meaning=profile.palette.find(r=>r.key===p.key);
 if(!meaning)throw Error('Unclassified source region '+faction+'/'+p.key);
 Object.assign(p,{register:'physical',classification:meaning.classification,role:meaning.role,physicalEmission:0,
   ...(meaning.metal?{metal:meaning.metal}:{}),...(meaning.uncertainty?{uncertainty:meaning.uncertainty}:{}),...(meaning.variant?{variant:meaning.variant}:{}),...(meaning.optics?{optics:meaning.optics}:{})});
 const designated=meaning.classification==='emissive-designated';
 energyAttachments[p.key]={designated,enabledByDefault:false,register:'energetic',
   faces:designated?faces.flatMap((f,i)=>palette[f.region].key===p.key?[i]:[]):[],
   features:Object.keys(features).filter(k=>features[k].region===p.key),
   evidence:designated?'Chris faction emissive set, mailbox 20260910T105522Z':'Outside this hull\'s emissive set',
   functions:meaning.role};
}
for(const p of patches)p.register='physical';
fs.writeFileSync(new URL(outputFolder+config.output+'-regions.json',here),JSON.stringify({format:'tabletop-colour-regions/3',faction,palette,patches,energyAttachments,features,sourceCoverage,derivativeCoverage},null,2)+'\n');
console.log(JSON.stringify({faction,output:config.output,patches:patches.length,regionAreaError:Math.max(...palette.map(p=>Math.abs(sourceCoverage[p.key]-derivativeCoverage[p.key])))}));
