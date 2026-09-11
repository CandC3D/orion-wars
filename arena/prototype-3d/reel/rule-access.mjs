// Offline audit only. Expose canonical private helpers without editing the engine.
// Import relocation and an export clause are the ONLY source transformations.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const url=new URL('../../../src/tactical/resolver.js',import.meta.url);
const original=fs.readFileSync(url,'utf8');
export const resolverHash=createHash('sha256').update(original).digest('hex');
if(original.includes('import.meta'))throw Error('Audit adapter requires review of import.meta semantics');
const relocated=original.replace(/(from\s+["'])(\.[^"']+)(["'])/g,(_,a,p,b)=>a+new URL(p,url).href+b);
export const rules=await import('data:text/javascript;base64,'+Buffer.from(relocated+'\nexport {moveOrdered,fire,intercepted,resolveHit};\n//# sourceURL=canonical-resolver-audit.mjs\n').toString('base64'));
