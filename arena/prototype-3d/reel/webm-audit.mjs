// Minimal read-only EBML inspection: proves packet preservation and timing.
import fs from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
export function inspectWebm(file){const data=fs.readFileSync(file),tracks=[],packets=[];let scale=1000000,duration=0;
 const vint=(p,id=false)=>{let n=1,mask=128;while(n<=8&&!(data[p]&mask)){mask>>=1;n++;}if(n>8)throw Error('Bad EBML VINT');let value=id?data[p]:data[p]&(mask-1);for(let i=1;i<n;i++)value=value*256+data[p+i];return {n,value};};
 const uint=(a,b)=>{let v=0;for(let i=a;i<b;i++)v=v*256+data[i];return v;};
 function walk(a,b,track=null,cluster=0){for(let p=a;p<b;){const id=vint(p,true),size=vint(p+id.n),start=p+id.n+size.n,end=Math.min(b,start+size.value);if(end<=p)throw Error('Bad EBML length');
  if([0x18538067,0x1549a966,0x1654ae6b,0x1f43b675,0xa0].includes(id.value))walk(start,end,track,id.value===0x1f43b675?0:cluster);
  else if(id.value===0xae){const t={};tracks.push(t);walk(start,end,t,cluster);}
  else if(id.value===0x2ad7b1)scale=uint(start,end);
  else if(id.value===0x4489)duration=end-start===8?data.readDoubleBE(start):data.readFloatBE(start);
  else if(id.value===0xe7)cluster=uint(start,end);
  else if(track&&id.value===0xd7)track.number=uint(start,end);
  else if(track&&id.value===0x83)track.type=uint(start,end);
  else if(track&&id.value===0x86)track.codec=data.toString('utf8',start,end);
  else if(track&&id.value===0x56aa)track.codecDelayNs=uint(start,end);
  else if(id.value===0xa3||id.value===0xa1){const t=vint(start),time=cluster+data.readInt16BE(start+t.n),flags=data[start+t.n+2];if(flags&6)throw Error('Laced block needs explicit support');const payload=data.subarray(start+t.n+3,end);packets.push({track:t.value,timestamp:time,bytes:payload.length,sha256:createHash('sha256').update(payload).digest('hex')});}
  p=end;
 }}walk(0,data.length);
 return {tracks,durationSeconds:duration*scale/1e9,timeScaleNs:scale,packets};
}
if(process.argv[1]?.endsWith('webm-audit.mjs')){
 const dir=new URL('../evidence/pre-alpha-reel-second-cut/',import.meta.url),a=inspectWebm(new URL('pre-alpha-reel-silent.webm',dir)),b=inspectWebm(new URL('pre-alpha-reel.webm',dir));
 const video=x=>x.packets.filter(p=>p.track===x.tracks.find(t=>t.type===1).number),av=video(a),bv=video(b),at=b.tracks.find(t=>t.type===2),audio=b.packets.filter(p=>p.track===at.number);
 assert.equal(av.length,950);assert.equal(bv.length,950);assert.deepEqual(av.map(p=>p.sha256),bv.map(p=>p.sha256),'Mux reencoded video');
 assert.deepEqual(av.map(p=>p.timestamp-av[0].timestamp),bv.map(p=>p.timestamp-bv[0].timestamp),'Mux changed frame spacing');assert.equal(at.codec,'A_OPUS');
 const result={videoFrames:bv.length,videoPayloadsIdentical:true,frameSpacingIdentical:true,firstVideoTimestampMs:bv[0].timestamp*b.timeScaleNs/1e6,firstAudioTimestampMs:audio[0].timestamp*b.timeScaleNs/1e6,audioCodecDelayMs:(at.codecDelayNs??0)/1e6,tracks:b.tracks,durationSeconds:b.durationSeconds,sha256:createHash('sha256').update(fs.readFileSync(new URL('pre-alpha-reel.webm',dir))).digest('hex')};
 fs.writeFileSync(new URL('mux-audit.json',dir),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
