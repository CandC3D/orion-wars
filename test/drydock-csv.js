import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stockPack,upgradeEngineering,forkPack,compileDesign,copy} from '../src/construction/index.js';
import {exportDesignCSV,parseDesignCSV,readCSV,CSV_LIMIT} from '../src/construction/csv.js';
import {REFERENCE_KEY,STOCK_REFERENCES,readReferences,referenceFor,planReference,assignReference} from '../src/construction/design-references.js';
import {importDraft} from '../drydock/model.js';
import {sameContent} from '../src/construction/content.js';
import {stockChanges} from '../src/construction/stock-library.js';
const t=JSON.parse(readFileSync(new URL('../data/tactical-tuning.json',import.meta.url))),l=JSON.parse(readFileSync(new URL('../data/loadouts.json',import.meta.url)));
const stock=stockPack('EAR','frigate',t,l),original=JSON.stringify({t,l,stock});
let count=0;const check=(name,fn)=>{fn();count++;console.log('ok: '+name);};
const serialize=rows=>rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
const edit=(csv,path,value)=>{const rows=readCSV(csv),row=rows.find(r=>r[2]===path);assert.ok(row,path);row[4]=String(value);return serialize(rows);};
check('all 29 stock designs and their V2 migrations roundtrip completely and compile identically',()=>{
  assert.equal(Object.keys(STOCK_REFERENCES).length,29);
  for(const faction of ['EAR','KRE','VRA','ZAN'])for(const cls of t.rosters[faction]){
    const p=stockPack(faction,cls,t,l),number=STOCK_REFERENCES[p.design.id];assert.ok(number);
    for(const pack of [p,upgradeEngineering(p,t)]){
      const before=copy(pack),decoded=parseDesignCSV(exportDesignCSV(pack,number,t),t);
      assert.equal(decoded.shipNumber,number);assert.deepEqual(decoded.pack,pack);
      assert.deepEqual(compileDesign(decoded.pack,t),compileDesign(pack,t));assert.deepEqual(pack,before);
    }
  }
});
let custom=upgradeEngineering(forkPack(stock,'local:csv-test'),t);
custom.design.name='=SUM(1,2) "星舰"';custom.design.notes="'001, nebula\r\nnext line\n@command\n+123\n-456";
custom.design.mounts[0].faces=[1,4];custom.design.mounts[0].position={x:-.275,y:.415,z:.13};
const csv=exportDesignCSV(custom,1000,t);
check('quoted commas/newlines/Unicode/quotes/apostrophes and noncontiguous arcs remain exact',()=>{
  assert.deepEqual(parseDesignCSV(csv,t).pack,custom);
  assert.deepEqual(parseDesignCSV(csv.replace(/^\uFEFF/,''),t).pack,custom);
  const rows=readCSV(csv);for(const r of rows.slice(1).filter(r=>r[3]==='string'))assert.ok(r[4].startsWith("'"));
  assert.equal(rows.find(r=>r[2]==='/design/name')[4],"'"+custom.design.name);
});
check('sorting rows does not change mount, face, range-band or component order',()=>{
  const rows=readCSV(csv),header=rows.shift();assert.deepEqual(parseDesignCSV(serialize([header,...rows.reverse()]),t).pack,custom);
});
check('sorted CSV and reordered JSON reimport keep saved identities and produce no spurious stock changes',()=>{
  for(const faction of ['EAR','KRE','VRA','ZAN'])for(const cls of t.rosters[faction]){
    const base=stockPack(faction,cls,t,l);
    for(const p of [base,upgradeEngineering(base,t)]){
      const before=JSON.stringify(p),rows=readCSV(exportDesignCSV(p,STOCK_REFERENCES[p.design.id],t)),header=rows.shift();
      for(const reordered of [rows.toSorted((a,b)=>a[2].localeCompare(b[2])),rows.toReversed()]){
        const incoming=parseDesignCSV(serialize([header,...reordered]),t).pack;
        assert.ok(sameContent(incoming,p));assert.deepEqual(stockChanges(p,incoming),[]);
        const opened=importDraft(incoming,p,[p]);assert.equal(opened.design.id,p.design.id);assert.equal(opened.design.revision,p.design.revision);assert.deepEqual(opened,p);assert.notEqual(opened,incoming);
        const variant=forkPack(p,'local:sorted-test'),json=JSON.parse(JSON.stringify(incoming));json.design.id=variant.design.id;json.design.name=variant.design.name;
        assert.equal(importDraft(json,variant,[variant]).design.id,variant.design.id);
      }assert.equal(JSON.stringify(p),before);
    }
  }
});
check('real edits and array ordering still fork; comparator preserves types, missing fields and literal strings',()=>{
  for(const mutate of [p=>p.design.name+=' changed',p=>p.design.mounts[0].position.x+=.001,p=>p.design.mounts[0].faces.reverse(),p=>p.weapons[0].spec.maxPower+=1,p=>p.design.engineering.reactors[0].component.revision++,p=>p.design.notes+='\n']){
    const changed=copy(custom);mutate(changed);assert.equal(sameContent(custom,changed),false);assert.notEqual(importDraft(changed,custom,[custom]).design.id,custom.design.id);
  }
  for(const [a,b]of [[{x:0},{x:'0'}],[{x:null},{}],[[1,2],[2,1]],[[],{}],[{x:false},{x:0}],[{x:'a\nb'},{x:'a\r\nb'}]])assert.equal(sameContent(a,b),false);
  assert.equal(sameContent({b:{d:2,c:1},a:[1,2]},{a:[1,2],b:{c:1,d:2}}),true);
});
check('individual CSV edits affect the authoritative pinned fields and nothing else',()=>{
  const changed=parseDesignCSV(edit(csv,'/design/mounts/0/position/x',.5),t).pack,expected=copy(custom);expected.design.mounts[0].position.x=.5;assert.deepEqual(changed,expected);
  const output=parseDesignCSV(edit(csv,'/systems/0/spec/power',17),t).pack;assert.equal(compileDesign(output,t).reactors[0].power,17);
  const cap=parseDesignCSV(edit(csv,'/systems/1/spec/capacity',0),t).pack;assert.equal(cap.systems[1].spec.capacity,0);
});
check('malformed quoting, duplicated/missing rows, wrong shapes and unsafe paths fail closed',()=>{
  const rows=readCSV(csv),bad=[csv.slice(0,-6)+'"',csv+'unquoted"bad',serialize([...rows,rows[2]]),serialize(rows.filter(r=>r[2]!=='')),serialize(rows.filter(r=>r[2]!=='/design/mounts/0'))];
  for(const [path,type,value] of [['/design/hull/__proto__','object',''],['/design/hull/script','string',"'alert(1)"],['/design/mounts/00','object',''],['/design/constructor','object','']])bad.push(serialize([...rows,['1','1000',path,type,value]]));
  for(const text of bad)assert.throws(()=>parseDesignCSV(text,t));
  assert.equal({}.polluted,undefined);
});
check('typed cells reject formulas, missing text protection and invalid combat data',()=>{
  for(const value of ['=1+1','Infinity','NaN','0x20','01',''])assert.throws(()=>parseDesignCSV(edit(csv,'/design/hull/points',value),t));
  assert.throws(()=>parseDesignCSV(edit(csv,'/design/name','=SUM(1,2)'),t),/apostrophe/);
  assert.throws(()=>parseDesignCSV(edit(csv,'/design/canCloak','maybe'),t),/boolean/);
  assert.throws(()=>parseDesignCSV(edit(csv,'/design/mounts/0/faces/0','7'),t));
  assert.throws(()=>parseDesignCSV(edit(csv,'/systems/1/spec/powerPerDamage','0'),t));
  assert.throws(()=>parseDesignCSV('x'.repeat(CSV_LIMIT+1),t));
  const rows=readCSV(csv);rows[2][1]='1001';assert.throws(()=>parseDesignCSV(serialize(rows),t),/one design number/);
  rows[2][1]='1000';rows[2][0]='2';assert.throws(()=>parseDesignCSV(serialize(rows),t),/version/);
});
let raw=null;const storage={getItem:key=>{assert.equal(key,REFERENCE_KEY);return raw;},setItem:(key,value)=>{assert.equal(key,REFERENCE_KEY);raw=value;}};
const assign=(id,preferred=null)=>assignReference(storage,id,preferred,raw);
check('stock numbers are fixed, do not depend on roster order, and require no storage write',()=>{
  const initial=readReferences(storage);assert.equal(referenceFor(stock.design.id,initial.registry),1);
  assert.equal(assign(stock.design.id).number,1);assert.equal(raw,null);
  assert.equal(referenceFor('constructor',initial.registry),null);
});
check('design keys retain numbers across revision/name changes; distinct forks allocate monotonically',()=>{
  const first=assign(custom.design.id);assert.equal(first.number,1000);
  assert.equal(assign(custom.design.id).number,1000);assert.equal(assign('local:fork').number,1001);
  assert.equal(assign('constructor').number,1002);assert.equal(readReferences(storage).registry.next,1003);
  assert.equal(planReference(readReferences(storage).registry,custom.design.id,5000).number,1000);
});
check('import references preserve free numbers and disclose occupied/reserved/local remapping',()=>{
  assert.equal(assign('local:import',4000).number,4000);
  const conflict=planReference(readReferences(storage).registry,'local:other',1000);assert.equal(conflict.number,4001);assert.match(conflict.note,/already assigned/);
  assert.equal(assign('local:other',1000).number,4001);
  const reserved=assign('local:reserved',1);assert.equal(reserved.number,4002);assert.match(reserved.note,/reserved/);
  const known=assign(custom.design.id,9999);assert.equal(known.number,1000);assert.match(known.note,/retained/);
});
check('stale, corrupt, duplicate and quota-failing registries are never overwritten',()=>{
  const before=raw;assert.throws(()=>assignReference(storage,'local:stale',null,null),/another tab/);assert.equal(raw,before);
  const blocked={getItem:()=>before,setItem:()=>{throw new Error('quota');}};
  assert.throws(()=>assignReference(blocked,'local:quota',null,before),/quota/);assert.equal(raw,before);
  for(const mutate of [r=>r.version=2,r=>r.extra=1,r=>r.entries.push(copy(r.entries[0])),r=>r.entries[0].number=1,r=>r.entries[0].id='stock:ear:frigate',r=>r.next=1000]){
    const r=JSON.parse(before);mutate(r);const broken=JSON.stringify(r),stub={getItem:()=>broken,setItem:()=>assert.fail('must not overwrite')};assert.throws(()=>readReferences(stub));
  }
});
check('interchange and numerical registry leave tuning, stock and the underlying pack schema unchanged',()=>{
  assert.equal(JSON.stringify({t,l,stock}),original);assert.equal(custom.design.number,undefined);
});
console.log(`Drydock CSV and numerical references passed: ${count} groups.`);
