import { createCommandSession } from './command-host.js';
let host=null,starting=false;
const data=Promise.all(['../data/tactical-tuning.json','../data/loadouts.json'].map(async url=>{
  const r=await fetch(url);if(!r.ok)throw new Error('Tactical data unavailable');return r.json();
}));
self.onmessage=async({data:request})=>{
  const id=request?.id;
  try{
    if(!Number.isSafeInteger(id)||!request||!['start','orders'].includes(request.type))throw new Error('Invalid request');
    if(request.type==='start'){
      if(host||starting)throw new Error('Session already started');
      if(Object.keys(request).sort().join(',')!=='id,setup,type')throw new Error('Invalid request');
      starting=true;
      const [tuning,loadouts]=await data;
      host=createCommandSession(request.setup,tuning,loadouts);
      self.postMessage({id,ok:true,value:{frame:host.session.view(),mission:host.mission}});
    }else{
      if(!host||Object.keys(request).sort().join(',')!=='id,orders,type')throw new Error('Invalid request');
      self.postMessage({id,ok:true,value:host.session.step(request.orders)});
    }
  }catch(error){
    // Only setup errors can describe supplied authoring data. Never forward a
    // live resolver error, which could contain hidden ship IDs or geometry.
    self.postMessage({id,ok:false,error:!host&&request?.type==='start'?
      `Setup refused: ${String(error.message).slice(0,800)}`:'Request refused. The command session is unchanged or unavailable.'});
  }
};
