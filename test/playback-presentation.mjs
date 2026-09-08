// Playback presentation: a launch is a departure, not an arrival.
//
// A torpedo launched this round reaches its target in the NEXT turn's impact
// phase - the engine emits the arrival there as its own event. The launch cue
// must therefore clear the tube and no further, or the impact reads a whole
// turn early.
import assert from 'node:assert/strict';
import {effectMarkup,effectDuration} from '../arena/contact-effects.js';
let groups=0;const check=(n,f)=>{f();console.log('PASS '+n);groups++;};
const project=p=>({x:100+p.q*20,y:100+p.r*20});
const launch={kind:'launch',direction:'outgoing',outcome:'launched',shooterId:'own-1',
  source:{q:0,r:0},destination:{q:10,r:0}};                    // launcher x=100, target x=300
const draw=(event,phase,reduced=false)=>effectMarkup(event,{project,scale:20,icon:16,phase,reduced,seed:'1'});
// The bright core rides with the projectile glyph.
const glyphX=markup=>{const m=[...markup.matchAll(/<circle cx="([\d.]+)" cy="[\d.]+" r="[\d.]+" fill="#f{3,6}" opacity="0\.95"/gi)];
  return m.length?+m[0][1]:null;};

check('the torpedo never reaches its target during the launch',()=>{
  let last=100;
  for(const phase of [0,0.25,0.5,0.75,1]){
    const x=glyphX(draw(launch,phase));
    assert.ok(x!==null,`phase ${phase}: a projectile glyph must be drawn`);
    assert.ok(x>=last-0.001,`phase ${phase}: the torpedo must not travel backwards`);
    assert.ok(x<180,`phase ${phase}: the torpedo reached ${x} of a 100-to-300 line; a launch must not land`);
    last=x;
  }
  assert.ok(glyphX(draw(launch,1))>110,'it must visibly clear the launcher');
});

check('the aimed line is still drawn, so the shot has a stated destination',()=>{
  const g=draw(launch,0.6);
  assert.match(g,/stroke-dasharray/,'the remaining course is shown dashed');
  assert.ok(g.includes('launch'),'the cue is labelled a launch');
});

check('no arrival ring is drawn at the target by the launch',()=>{
  // An expanding ring centred on the target hex is the arrival cue's mark. At
  // 300,100 it would claim the torpedo had landed.
  for(const phase of [0.85,0.95,1]){
    const rings=[...draw(launch,phase).matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="[\d.]+" fill="none"/g)];
    for(const r of rings)assert.ok(Math.abs(+r[1]-300)>1||Math.abs(+r[2]-100)>1,
      `phase ${phase}: a ring at the target hex lands the torpedo early`);
  }
});

check('a launch with no disclosed destination still only drifts clear',()=>{
  const sourceOnly={...launch,destination:undefined};
  const g=draw(sourceOnly,1);
  assert.ok(g.length>0,'a source-only launch still draws');
  assert.equal(/stroke-dasharray/.test(g),false,'no course may be drawn when none is disclosed');
});

check('the arrival is a separate, longer cue',()=>{
  const arrival={kind:'missile',direction:'incoming',outcome:'resolved',targetId:'own-1',
    destination:{q:10,r:0},face:2};
  assert.ok(effectDuration(arrival,false)>effectDuration(launch,false),
    'the arrival must not be briefer than the departure');
  assert.ok(draw(arrival,0.5).length>0,'the arrival draws its own cue');
});

console.log(`Playback presentation: ${groups} groups passed.`);
