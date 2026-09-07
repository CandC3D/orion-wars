// Strict, bounded JSON at the trusted-code boundary. Not a JavaScript sandbox:
// a future interpreter must return serialized JSON, never live Proxy objects.
export function jsonCopy(value, { bytes = 65536, depth = 12, nodes = 20000 } = {}) {
  const active = new Set();
  let count = 0;
  function walk(v, level) {
    if (++count > nodes || level > depth) throw new Error('JSON complexity limit');
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (!v || typeof v !== 'object') throw new Error('Not strict JSON');
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    if (!array && proto !== Object.prototype && proto !== null) throw new Error('Not a plain JSON object');
    if (active.has(v)) throw new Error('Cyclic JSON');
    active.add(v);
    const out = array ? [] : {};
    const keys = Reflect.ownKeys(v).filter(k => !(array && k === 'length'));
    if (array && keys.length !== v.length) throw new Error('Sparse or extended JSON array');
    for (const k of keys) {
      if (typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(k)) throw new Error('Unsafe JSON key');
      if (array && (!/^(0|[1-9][0-9]*)$/.test(k) || Number(k) >= v.length)) throw new Error('Extended JSON array');
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (!d.enumerable || !('value' in d)) throw new Error('JSON accessors are forbidden');
      out[k] = walk(d.value, level + 1);
    }
    active.delete(v);
    return out;
  }
  const copy = walk(value, 0);
  if (new TextEncoder().encode(JSON.stringify(copy)).length > bytes) throw new Error('JSON byte limit');
  return copy;
}
export function freezeTree(v) {
  if (v && typeof v === 'object') { for (const child of Object.values(v)) freezeTree(child); Object.freeze(v); }
  return v;
}
export function canonicalJSON(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJSON).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalJSON(v[k])).join(',') + '}';
}
