// Shared presentation vocabulary. Face membership comes from the live tuning
// catalogue (or a mount's explicit saved faces), never a second rules table.
export const ARC_NAMES = Object.freeze({
  fwd: 'forward 180°', aft: 'aft 180°', p: 'port', s: 'starboard',
  fs: 'starboard fore', fp: 'port fore', sa: 'starboard rear', pa: 'port rear',
  f: 'forward only', a: 'aft only', bow: 'bow turret', stern: 'stern turret', all: 'all-round'
});

export function arcPresets(arcs) {
  return Object.entries(ARC_NAMES).filter(([code]) => Array.isArray(arcs?.[code]))
    .map(([code, name]) => ({ code, name, faces: [...arcs[code]] }));
}

export function matchingArc(faces, arcs) {
  if (!Array.isArray(faces) || !faces.length || new Set(faces).size !== faces.length) return null;
  return arcPresets(arcs).find(p => p.faces.length === faces.length && p.faces.every(f => faces.includes(f))) ?? null;
}

// Derive the label from actual membership, not a potentially stale arcName.
// Unrecognized/disconnected combinations must remain visibly custom.
export function arcLabel(faces, arcs) {
  const preset = matchingArc(faces, arcs);
  if (preset) return `${preset.name} (${preset.faces.join(',')})`;
  if (!Array.isArray(faces) || !faces.length) return 'no firing faces';
  return `custom (${[...faces].sort((a,b) => a-b).join(',')})`;
}
