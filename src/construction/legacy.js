// Legacy stock normalization. Preserve historical count, arc-cycle and rounding rules.
// Only stock content uses this adapter; authored designs always have explicit mounts.
export function legacySpec(faction, className, tuning, loadouts) {
  const hull = tuning.hullClasses[className];
  if (!hull) throw new Error(`unknown hull class: ${className}`);
  const mod = tuning.factionModifiers[faction] ?? {};
  const lo = loadouts[faction][className] ?? loadouts[faction]._default;

  // A loadout may override the class envelope for faction flavour.
  const beamMounts = lo.beamMounts ?? hull.beamMounts;
  const missileMounts = lo.missileMounts ?? hull.missileMounts;
  const magazine = lo.magazine ?? hull.magazine;
  const beamArcs = lo.beamArcs ?? hull.beamArcs;
  const missileArcs = lo.missileArcs ?? hull.missileArcs;

  const arcFaces = (name) => tuning.arcs[name] ?? tuning.arcs.f;

  // Heavier hulls mount larger marks of the same weapon. Scale each mount's
  // reach and its range-band boundaries by the class's weaponReach.
  const reach = hull.weaponReach ?? 1;
  const scaleWeapon = (typeName) => {
    const w = tuning.weapons[typeName];
    return {
      maxRange: Math.max(1, Math.round(w.maxRange * reach)),
      bands: w.rangeBands.map((b) => ({ ...b, to: Math.max(1, Math.round(b.to * reach)) }))
    };
  };

  const mounts = [];
  for (let i = 0; i < beamMounts; i++) {
    mounts.push({
      id: mounts.length + 1, type: lo.beam, kind: "beam",
      arc: arcFaces(beamArcs[i % beamArcs.length]),
      arcName: beamArcs[i % beamArcs.length],
      ...scaleWeapon(lo.beam),
      inop: false, firedThisTurn: false
    });
  }
  // Split missile mounts by the faction's declared mix, largest remainder first.
  const mix = Object.entries(lo.missileMix ?? {});
  const counts = mix.map(([type, frac]) => ({ type, exact: frac * missileMounts }));
  let assigned = 0;
  for (const c of counts) { c.n = Math.floor(c.exact); assigned += c.n; }
  counts.sort((a, b) => (b.exact - b.n) - (a.exact - a.n));
  for (let i = 0; assigned < missileMounts; i++, assigned++) counts[i % counts.length].n++;
  let mi = 0;
  for (const c of counts) {
    for (let i = 0; i < c.n; i++, mi++) {
      const name = missileArcs.length ? missileArcs[mi % missileArcs.length] : "f";
      mounts.push({
        id: mounts.length + 1, type: c.type, kind: "missile",
        arc: arcFaces(name), arcName: name,
        ...scaleWeapon(c.type),
        inop: false, firedThisTurn: false
      });
    }
  }

  // SPINAL MOUNT. A weapon bolted to the keel: one mount, one arc, aimed by
  // pointing the whole ship. Built only when the hull or loadout declares one,
  // so every existing hull builds byte-for-byte as before.
  const spinalType = lo.spinal ?? hull.spinal ?? null;
  if (spinalType) {
    const sName = (lo.spinalArcs ?? hull.spinalArcs ?? ["f"])[0];
    mounts.push({
      id: mounts.length + 1, type: spinalType, kind: "spinal",
      arc: arcFaces(sName), arcName: sName,
      ...scaleWeapon(spinalType),
      inop: false, firedThisTurn: false
    });
  }

  // Published stock layouts specify every installation explicitly. Historical
  // envelopes remain available for legacy/custom tuning without this field.
  // No cycling, mirroring or geometric inference is applied to authored faces.
  if (lo.mounts !== undefined) {
    if (!Array.isArray(lo.mounts) || lo.mounts.length > 64) throw new Error(`Invalid stock mounts: ${faction}/${className}`);
    const explicit = lo.mounts.map((m, i) => {
      const w = tuning.weapons[m?.type];
      const valid = m && Object.keys(m).every(k => ['type','faces','position','orientation'].includes(k)) &&
        w && ['beam','missile','spinal'].includes(w.kind) &&
        Array.isArray(m.faces) && m.faces.length >= 1 && m.faces.length <= 6 &&
        new Set(m.faces).size === m.faces.length && m.faces.every(f => Number.isInteger(f) && f >= 1 && f <= 6) &&
        m.position && Object.keys(m.position).length === 3 && ['x','y','z'].every(k => Number.isFinite(m.position[k]) && Math.abs(m.position[k]) <= 2) &&
        Number.isFinite(m.orientation) && Math.abs(m.orientation) <= 180;
      if (!valid) throw new Error(`Invalid stock mount ${i + 1}: ${faction}/${className}`);
      const arcName = Object.entries(tuning.arcs).find(([,faces]) => Array.isArray(faces) && faces.length === m.faces.length && faces.every(f => m.faces.includes(f)))?.[0] ?? `faces ${m.faces.join('/')}`;
      return {id:i+1,type:m.type,kind:w.kind,arc:[...m.faces],arcName,...scaleWeapon(m.type),
        position:{...m.position},orientation:m.orientation,inop:false,firedThisTurn:false};
    });
    if (explicit.filter(m => m.kind === 'spinal').length > 1) throw new Error(`Multiple stock spinal mounts: ${faction}/${className}`);
    mounts.splice(0, mounts.length, ...explicit);
  }

  const canCloak = (tuning.cloak.carriedBy[faction] ?? []).includes(className);
  const superstructure = Math.round(hull.superstructure * (mod.superstructure ?? 1));

  return { hull, mounts, magazine, spinalType:lo.mounts !== undefined ? mounts.find(m=>m.kind==='spinal')?.type??null : spinalType, canCloak, superstructure,
    shieldPointRatio: hull.shieldPointRatio * (mod.shieldPointRatio ?? 1),
    movementPointRatio: hull.movementPointRatio * (mod.movementPointRatio ?? 1),
    detectionBonusAgainst: mod.detectionRangeAgainst ?? 0 };
}
