import fs from 'node:fs/promises';
const here=new URL('./',import.meta.url);
const {hulls}=JSON.parse(await fs.readFile(new URL('fleet-assets.json',here)));
const rows=hulls.filter(h=>h.faction!=='VRA').map(({id,name,code})=>({id,name,code}));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Window normals — matched comparisons</title>
<style>body{margin:24px;background:#eee9df;color:#252722;font:17px/1.45 Georgia,serif}h1{margin:0 0 12px}p{max-width:100ch}label{display:inline-block;margin:8px 24px 16px 0}select{font:inherit;padding:6px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{display:block;width:100%;height:auto}figcaption{font-weight:bold;margin-bottom:8px}a{color:inherit}#status{font:14px/1.5 Arial}nav a{display:inline-block;margin-right:14px}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style>
<h1>Earth and Krelath — window normals</h1>
<p>Left: the previous smooth derivative. Right: 40° crease splits with area-and-angle weighted normals. Each pair uses identical geometry, camera and lighting. Neutral views remove paint, ink, AO, textures, reflections and shadows; finished views retain the approved miniature treatment. Click an image for its native capture.</p>
<nav><a href="REVISION-12-REVIEW.md">Diagnosis and scores</a><a href="fleet-sheets/earth.html">Earth sheet</a><a href="fleet-sheets/krelath.html">Krelath sheet</a></nav>
<label>Hull <select id="hull"></select></label><label>Matched view <select id="view">
<option value="neutral-detail">Neutral · window detail (Acamar / Sparrowhawk)</option>
<option value="neutral-side">Neutral · side</option><option value="neutral-port">Neutral · opposite flank</option><option value="neutral-quarter">Neutral · three-quarter</option><option value="neutral-top">Neutral · top</option>
<option value="finished-side">Finished · side</option><option value="finished-quarter">Finished · three-quarter</option><option value="finished-strip">Finished · shared-scale capture</option></select></label>
<h2 id="name"></h2><div class="pair"><figure><figcaption>Before — unrestricted smoothing</figcaption><a id="beforeLink"><img id="before" alt="Previous normals"></a></figure><figure><figcaption>After — crease splits, weighted within each smooth region</figcaption><a id="afterLink"><img id="after" alt="Corrected normals"></a></figure></div>
<p id="status">Loading paired captures…</p>
<script>
const hulls=${JSON.stringify(rows)},hull=document.querySelector('#hull'),view=document.querySelector('#view');
for(const h of hulls)hull.add(new Option(h.name+' · '+h.code,h.id));
const hasDetail=id=>['ear-acamar','kre-sparrowhawk'].includes(id);
function render(){
 const h=hulls.find(h=>h.id===hull.value);view.options[0].disabled=!hasDetail(h.id);if(!hasDetail(h.id)&&view.value==='neutral-detail')view.value='neutral-side';
 document.querySelector('#name').textContent=h.name+' · '+h.code;
 const [kind,angle]=view.value.split('-');
 for(const mode of ['before','after']){const url=kind==='neutral'?'evidence/revision-12/neutral/'+h.id+'-'+mode+'-'+angle+'.png':(mode==='before'?'evidence/revision-12/baseline/':'evidence/fleet/images/')+h.id+'-'+angle+'.png';document.querySelector('#'+mode).src=url;document.querySelector('#'+mode+'Link').href=url;}
 document.querySelector('#status').textContent=(kind==='neutral'?'1200 × 900 neutral capture':'1000 × 720 finished capture')+' · Same camera in both images. Diagnostic close crops isolate the recess; use side, opposite flank and quarter views to check curvature.';
 history.replaceState(null,'','#'+h.id+'/'+view.value);
}
function fromHash(){const [id,v]=location.hash.slice(1).split('/');hull.value=hulls.some(h=>h.id===id)?id:'ear-acamar';if([...view.options].some(o=>o.value===v))view.value=v;render();}
hull.addEventListener('change',render);view.addEventListener('change',render);addEventListener('hashchange',fromHash);fromHash();
</script></html>`;
await fs.writeFile(new URL('WINDOW-COMPARISONS.html',here),html+'\n');
console.log('18 hulls; neutral and finished before/after comparison page written.');
