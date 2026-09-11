import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createServer} from 'node:http';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/chorr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),out=path.join(here,'evidence/revision-12/neutral');await fs.mkdir(out,{recursive:true});
const args=process.argv.slice(2),modes=(args.find(a=>a.startsWith('--modes='))??'--modes=before,after').slice(8).split(',');
const available=JSON.parse(await fs.readFile(path.join(here,'fleet-assets.json'))).hulls.filter(h=>h.faction!=='VRA').map(h=>h.id);
const requested=args.filter(a=>!a.startsWith('--')),ids=requested.length?requested:available;
assert.ok(ids.every(id=>available.includes(id)),'Only active Earth/Krelath hulls belong in this study');
assert.ok(modes.every(m=>['before','after','30','40','60','40w'].includes(m)),'Unknown normal variant');
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error('outside');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true,executablePath:process.env.PROTOTYPE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/arena/prototype-3d/normal-study.html`);await page.waitForFunction(()=>window.normalStudy?.ready);
 for(const id of ids){let cameras={};for(const mode of modes){await page.evaluate(([id,mode])=>window.normalStudy.load(id,mode),[id,mode]);for(const view of ['side','port','quarter','top',...(['ear-acamar','kre-sparrowhawk'].includes(id)?['detail']:[])]){
  const detail=view==='detail'?(id==='ear-acamar'?{centre:[-1.2,-.18,.98],width:2.5}:{centre:[-.18,0,.83],width:1.2}):null;
  const r=await page.evaluate(([v,d])=>window.normalStudy.capture(v,d),[view,detail]);if(cameras[view])assert.deepEqual(r.camera,cameras[view]);else cameras[view]=r.camera;await page.locator('canvas').screenshot({path:path.join(out,id+'-'+mode+'-'+view+'.png')});results.push({...r,mode});}}console.log(id+' neutral cameras matched across '+modes.join('/'));}
 assert.deepEqual(errors,[]);const selection=ids.length===available.length?'all-earth-krelath':createHash('sha256').update(ids.join(',')).digest('hex').slice(0,12);
 const name='cameras-'+selection+'-'+modes.join('_')+'.json';await fs.writeFile(path.join(out,name),JSON.stringify({results,errors},null,2)+'\n');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
