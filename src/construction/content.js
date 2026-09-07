// Structural equality for validated JSON content. Object property order is
// serialization detail; array order and every value remain part of identity.
// Do not use for raw storage/version checks: those must still compare exact bytes.
export function sameContent(a,b) {
  if(a===b)return true;
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a))return a.length===b.length&&a.every((value,index)=>sameContent(value,b[index]));
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&sameContent(a[key],b[key]));
}
