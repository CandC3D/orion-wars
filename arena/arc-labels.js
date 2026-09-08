// Shared presentation vocabulary. Face membership comes from the live tuning
// catalogue (or a mount's explicit saved faces), never a second rules table.
export const ARC_NAMES = Object.freeze({
  fwd: 'forward 180°', aft: 'aft 180°',
  // The glossary calls these broadsides. The bare side name reads as the whole
  // flank rather than the two faces the mount actually bears on.
  p: 'port broadside', s: 'starboard broadside',
  fs: 'starboard fore', fp: 'port fore', sa: 'starboard rear', pa: 'port rear',
  f: 'forward only', a: 'aft only', bow: 'bow turret', stern: 'stern turret', all: 'all-round',
  // Named 2026-09-07 (Chris). The first two are true 180° spans rotated one
  // face off the bow, so they belong to the forward-180 family. "Two-turret
  // broadside" is the glossary's own phrase for the bow/stern overlap: every
  // face except dead ahead and dead astern.
  pfwd: 'port bow 180°', sfwd: 'starboard bow 180°', broad: 'two-turret broadside',
  pb: 'port bow only', sb: 'starboard bow only'
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
