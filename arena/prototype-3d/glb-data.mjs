// Read mesh attributes as well as materials: COLOR_0 is part of the art contract.
import fs from 'node:fs';
export function readGLB(file) {
  const buffer=fs.readFileSync(file),jsonLength=buffer.readUInt32LE(12);
  const json=JSON.parse(buffer.subarray(20,20+jsonLength));
  const binary=buffer.subarray(20+jsonLength+8);
  const types={5120:['readInt8',1,127],5121:['readUInt8',1,255],5122:['readInt16LE',2,32767],5123:['readUInt16LE',2,65535],5125:['readUInt32LE',4,4294967295],5126:['readFloatLE',4,1]};
  const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
  function attribute(index){
    const a=json.accessors[index],view=json.bufferViews[a.bufferView],[method,bytes,max]=types[a.componentType],n=components[a.type];
    const offset=(view.byteOffset??0)+(a.byteOffset??0),stride=view.byteStride??n*bytes;
    return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,c)=>binary[method](offset+i*stride+c*bytes)/(a.normalized?max:1)));
  }
  return {json,attribute};
}
export const colourKey=c=>c.slice(0,3).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
