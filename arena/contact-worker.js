// All live engine state stays in this dedicated worker, never in window.__play,
// a DOM property, storage, a page diagnostic object or a replay download.
import { createPlayerSession } from '../src/captains/player-session.js';
let session = null, starting = false;
const allowedFactions = ['EAR','KRE','VRA','ZAN'];
const data = Promise.all(['../data/tactical-tuning.json','../data/loadouts.json'].map(async url => {
  const response = await fetch(url); if (!response.ok) throw new Error('Data unavailable'); return response.json();
}));
self.onmessage = async ({ data: request }) => {
  const id = request?.id;
  try {
    if (!Number.isSafeInteger(id) || !request || !['start','orders'].includes(request.type)) throw new Error('Invalid request');
    if (request.type === 'start') {
      if (session || starting) throw new Error('Session already started');
      if (Object.keys(request).some(k => !['id','type','faction','opponent'].includes(k))) throw new Error('Invalid request');
      if (![request.faction,request.opponent].every(f => allowedFactions.includes(f))) throw new Error('Invalid faction');
      starting = true;
      const [tuning,loadouts] = await data;
      const scenario = { name:'First contacts',seed:'contact-trial-1',maxTurns:20,
        map:{widthHexes:72,heightHexes:40},terrain:[{type:'moon',q:0,r:4},{type:'nebula',q:0,r:-5}],
        sides:[{faction:request.faction,ships:[{className:'light-cruiser',q:-16,r:0,facing:0},{className:'destroyer',q:-17,r:2,facing:0}]},
          {faction:request.opponent,ships:[{className:'light-cruiser',q:16,r:0,facing:3},{className:'destroyer',q:17,r:-2,facing:3}]}] };
      session = createPlayerSession(scenario,tuning,loadouts,'A');
      self.postMessage({id,ok:true,value:{frame:session.view()}});
    } else {
      if (!session || Object.keys(request).some(k => !['id','type','orders'].includes(k))) throw new Error('Invalid request');
      self.postMessage({id,ok:true,value:session.step(request.orders)});
    }
  } catch {
    // Never forward resolver errors that might contain hidden IDs/geometry.
    self.postMessage({id,ok:false,error:'Request refused. The contact session is unchanged or unavailable.'});
  }
};
