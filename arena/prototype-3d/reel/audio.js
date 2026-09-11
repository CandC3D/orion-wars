import {createCombatAudio} from '../../combat-audio.js';
import {timeline,DURATION} from './timeline.js';
const packet=await fetch('./scenario.json').then(r=>r.json()),{cues}=timeline(packet),rate=48000;
const offline=new OfflineAudioContext(1,Math.round(DURATION*rate),rate);
// Reuse the existing cue implementation intact, scheduling against a zero-based
// offline clock. Its destination is this offline render, not a loudspeaker.
const hostContext=new Proxy(offline,{get(o,key){if(key==='state')return 'running';const v=o[key];return typeof v==='function'?v.bind(o):v;}});
const sound=createCombatAudio({AudioContext:class{constructor(){return hostContext;}}});
for(const c of cues)sound.cue(c.cue,c.time);
const reference=await offline.startRendering();
const b64=buffer=>{let s='';const a=new Uint8Array(buffer);for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);};
function envelope(buffer){const data=buffer.getChannelData(0),step=buffer.sampleRate/1000,result=new Float32Array(Math.floor(data.length/step));for(let i=0;i<result.length;i++){let v=0;for(let j=Math.floor(i*step);j<Math.floor((i+1)*step);j++)v+=Math.abs(data[j]);result[i]=v/step;}return result;}
const ref=envelope(reference);
function compare(actual,rangeMs=400){const obs=envelope(actual),groups=[...new Set(cues.map(c=>c.time))],rows=[];
 for(const time of groups){const start=Math.round(time*1000),end=Math.min(ref.length,start+110);let best={score:-1,lag:0};
  for(let lag=-rangeMs;lag<=rangeMs;lag++){let ab=0,aa=0,bb=0;for(let i=start;i<end;i++){const a=ref[i],b=obs[i+lag]??0;ab+=a*b;aa+=a*a;bb+=b*b;}const score=ab/Math.sqrt(aa*bb||1);if(score>best.score)best={score,lag};}
  rows.push({time,frame:Math.round(time*30),roles:cues.filter(c=>c.time===time).map(c=>c.role),lagMs:best.lag,correlation:best.score});
 }
 const lags=rows.map(r=>r.lagMs).sort((a,b)=>a-b),median=lags[Math.floor(lags.length/2)];return {sampleRate:actual.sampleRate,duration:actual.duration,measurement:'1 ms amplitude envelope; 110 ms cue attack; normalized cross correlation',medianLagMs:median,worstAbsoluteMs:Math.max(...lags.map(Math.abs)),rows};
}
window.audioAssembly={ready:true,cues,async record(){
 const context=new AudioContext({sampleRate:rate}),dest=context.createMediaStreamDestination(),source=context.createBufferSource();source.buffer=reference;source.connect(dest);
 const recorder=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 const stopped=new Promise(r=>recorder.onstop=r),ended=new Promise(r=>source.onended=r);
 await context.resume();recorder.start(100);source.start(context.currentTime);await ended;await new Promise(r=>setTimeout(r,100));recorder.stop();await stopped;
 const data=await new Blob(chunks,{type:recorder.mimeType}).arrayBuffer(),decoded=await context.decodeAudioData(data.slice(0)),audit=compare(decoded);let peak=0;for(const v of reference.getChannelData(0))peak=Math.max(peak,Math.abs(v));
 await window.saveAudio(b64(data));await context.close();return {...audit,mimeType:recorder.mimeType,bitrate:recorder.audioBitsPerSecond,referencePeak:peak,cues};
 },async verify(path){const context=new AudioContext({sampleRate:rate}),data=await fetch(path).then(r=>r.arrayBuffer()),decoded=await context.decodeAudioData(data),audit=compare(decoded,40);await context.close();return audit;}};
