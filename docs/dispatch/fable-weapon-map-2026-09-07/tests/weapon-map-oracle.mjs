// Independent oracle for the weapon map. Every roster hull, every mount, six headings.
//
// REWRITTEN 2026-09-07 (second pass). The first version assumed the map drew one
// convex SECTOR per face: it read a sector's centreline vertex to check rotation,
// and tested coverage by point-in-polygon against that sector. The renderer has
// since moved to hex-grid outlines - a continuous sector edge through cell centres
// cannot express the engine's seam ruling - so both checks had become meaningless
// and reported tens of thousands of phantom mismatches. Anyone running the old
// oracle would have concluded the map was badly broken while it was exactly right.
//
// This version decodes the cells the renderer ACTUALLY draws: every hex is one
// closed six-corner subpath, so averaging its corners and inverting the projection
// recovers the cell, without consulting the module's own coverage helper. Expected
// ownership still comes from the WRITTEN convention (1 forward-port, 2 forward,
// 3 forward-starboard, 4 aft-starboard, 5 aft, 6 aft-port; port = +1 hex direction,
// DIRS counter-clockwise), never from the renderer's table.
//
// Usage: node weapon-map-oracle.mjs --source <root> --out <dir outside the source root>
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const source = path.resolve(arg('--source', '.')), out = path.resolve(arg('--out', '.'));
if (out === source || out.startsWith(source + path.sep) || /DbS3FZ|94bdLP|kTSzA9/.test(out)) { console.error('REFUSED: out inside a frozen root'); process.exit(2); }
mkdirSync(out, { recursive: true });
const u = p => pathToFileURL(path.join(source, p)).href;
const S = await import(u('src/tactical/ship.js')); const P = await import(u('src/prng.js')); const H = await import(u('src/tactical/hex.js'));
const FX = await import(u('arena/contact-weapon-arcs.js')); const MV = await import(u('arena/contact-movement-range.js'));
const AL = await import(u('arena/arc-labels.js'));
const t = JSON.parse(readFileSync(path.join(source, 'data/tactical-tuning.json'), 'utf8'));
const l = JSON.parse(readFileSync(path.join(source, 'data/loadouts.json'), 'utf8'));
const approvals = ['docs/drydock/stock-promotion-2026-09-05', 'docs/drydock/stock-amendments-2026-09-06',
  'docs/drydock/earth-light-cruiser-amendment-2026-09-06', 'docs/drydock/earth-gunstar-amendment-2026-09-07',
  'docs/drydock/vraygon-battleship-amendment-2026-09-07']
  .map(d => { try { return JSON.parse(readFileSync(path.join(source, d, 'approved-designs.json'), 'utf8')).designs; } catch { return null; } })
  .filter(Boolean);
const approvedFor = key => { for (let i = approvals.length - 1; i >= 0; i--) { const e = approvals[i].find(x => x.key === key); if (e) return e; } return null; };
// Written convention: hex-direction offset from the ship's facing, per face.
const FACE_OFFSET = { 2: 0, 1: 1, 6: 2, 5: 3, 4: 4, 3: 5 };
const mod6 = n => ((n % 6) + 6) % 6;
const findings = []; const note = (sev, id, detail) => findings.push({ sev, id, detail });
const scale = 9.5, ox = 450, oy = 260;   // geometry is scale-invariant; one projection is enough
const xy = p => ({ x: ox + (p.q + p.r / 2) * scale, y: oy + p.r * scale * 0.866 });
// Inverse of the projection above, for decoding what the renderer drew.
const unxy = (x, y) => { const r = (y - oy) / (scale * 0.866); return { q: Math.round((x - ox) / scale - r / 2), r: Math.round(r) }; };
// Every drawn hex is one closed six-corner subpath: average the corners, invert.
function decodeCells(d) {
  const cells = [];
  for (const sub of String(d).split('Z')) {
    const pts = [...sub.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(m => [+m[1], +m[2]]);
    if (pts.length !== 6) continue;
    cells.push(unxy(pts.reduce((n, p) => n + p[0], 0) / 6, pts.reduce((n, p) => n + p[1], 0) / 6));
  }
  return cells;
}
const key = c => c.q + ',' + c.r;
// A hex centre sitting exactly on a 30-degree bearing boundary belongs to whichever
// face the engine's rounding assigns; the oracle records these rather than judging.
const onSeam = (from, to) => { const q = to.q - from.q, r = to.r - from.r, s = -q - r; return q === r || r === s || s === q; };
// Independent bearing: screen angle of the cell, bucketed into six 60-degree wedges.
function writtenDirection(from, to) {
  const a = xy(from), b = xy(to);
  const deg = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI + 360) % 360;
  return mod6(Math.round(deg / 60));
}
let hulls = 0, mounts = 0, cells = 0, seamCells = 0, realMismatch = 0, seamMismatch = 0, bandRows = 0, keyRows = 0;
let atMaxMismatch = 0, seamEngineTrue = 0, seamEngineFalse = 0, decoded = 0, rotationChecked = 0, tierCells = 0;
const perMount = [];
for (const f of ['EAR', 'KRE', 'VRA', 'ZAN']) for (const c of t.rosters[f]) {
  const s = S.buildShip(f + '-' + c, f, c, t, l, P.makePrng(1));
  s.pos = { q: 0, r: 0 }; s.fullPower = S.fullPower(s);
  s.mounts.forEach(m => { m.weapon = S.weaponFor(s, m.type, t); }); hulls++;
  const pack = approvedFor(f + '/' + c);
  if (pack) {
    const packFaces = (pack.pack?.design?.mounts || pack.design?.mounts || []).map(m => [...(m.faces || m.arc || [])].sort((a, b) => a - b).join(','));
    const built = s.mounts.map(m => [...m.arc].sort((a, b) => a - b).join(','));
    if (JSON.stringify(packFaces) !== JSON.stringify(built)) note('major', 'pack-vs-built:' + f + ':' + c, { packFaces, built });
  } else note('gap', 'no-approval-pack:' + f + ':' + c, 'approval pack not found by key; built mounts compared to convention only');

  for (const m of s.mounts) {
    mounts++;
    // Every arc in use must resolve to a NAMED preset. Six had none until
    // 2026-09-07, and the interface could only render them as "custom (1,2,6)".
    if (!AL.matchingArc(m.arc, t.arcs)) note('major', 'unnamed-arc:' + f + ':' + c + ':' + m.id, { arc: m.arc, label: AL.arcLabel(m.arc, t.arcs) });

    for (let h = 0; h < 6; h++) {
      const ship = { ...s, facing: h };
      const markup = FX.weaponArcMarkup(ship, m, { project: xy, scale });
      const groups = [...markup.matchAll(/<path data-arc-face="(\d)" d="([^"]+)"/g)].map(x => ({ face: +x[1], cells: decodeCells(x[2]) }));
      if (groups.map(g => g.face).join() !== m.arc.join()) note('major', 'faces:' + f + ':' + c + ':' + m.id + ':h' + h, { rendered: groups.map(g => g.face), arc: m.arc });

      // ROTATION, rewritten: every cell drawn under a face must lie in the wedge
      // the written convention assigns to that face at this heading. Seam cells
      // are exempt, their bearing being exactly on a boundary.
      for (const g of groups) {
        const want = mod6(h + FACE_OFFSET[g.face]);
        for (const cell of g.cells) {
          if (onSeam(s.pos, cell)) continue;
          rotationChecked++;
          const got = writtenDirection(s.pos, cell);
          if (got !== want) note('major', 'rotation:' + f + ':' + c + ':' + m.id + ':h' + h + ':face' + g.face, { cell, got, want });
        }
      }

      // COVERAGE, rewritten: the decoded cell set against the engine's own predicate.
      const drawn = new Set();
      for (const g of groups) for (const cell of g.cells) { drawn.add(key(cell)); decoded++; }
      const R = m.maxRange + 1;
      for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) {
        const hex = { q, r }, d = H.distance(s.pos, hex); if (d === 0 || d > R) continue; cells++;
        const engine = d <= m.maxRange && m.arc.includes(H.faceFor(h, H.bearing(s.pos, hex)));
        const rendered = drawn.has(key(hex));
        if (engine !== rendered) {
          if (onSeam(s.pos, hex) && d <= m.maxRange) { seamMismatch++; if (engine) seamEngineTrue++; else seamEngineFalse++; }
          else { if (d === m.maxRange) atMaxMismatch++; realMismatch++; if (realMismatch <= 12) note('major', 'coverage:' + f + ':' + c + ':' + m.id + ':h' + h, { hex, d, engine, rendered }); }
        }
        if (onSeam(s.pos, hex) && d <= m.maxRange) seamCells++;
      }
    }

    // bands vs the engine's bandFor rule at every integer range
    const rows = FX.weaponRangeBands(m); bandRows += rows.length;
    for (let d = 1; d <= m.maxRange; d++) {
      const eng = m.bands.find(b => d <= b.to) || null; const row = rows.find(b => d >= b.from && d <= b.to) || null;
      if (!eng || !row || eng.to !== row.to && Math.min(eng.to, m.maxRange) !== row.to) note('major', 'band:' + f + ':' + c + ':' + m.id + ':d' + d, { eng, row });
      else for (const k of ['damageBonus', 'toHitMod', 'damageMod']) if ((eng[k] || 0) !== (row[k] || 0)) note('major', 'band-mod:' + f + ':' + c + ':' + m.id + ':d' + d + ':' + k, { eng, row });
    }

    // EFFECTIVE BAND (2026-09-07): the labels promise "BEST n / MAX n", so the
    // effective edge must be the outermost band still carrying the top modifier,
    // and a weapon with no falloff must not gain a second number.
    const dmg = b => FX.bandDamage(m, b);
    const eff = FX.effectiveBand(m);
    if (eff) {
      const best = Math.max(...rows.map(dmg));
      const edge = Math.max(...rows.filter(b => dmg(b) === best).map(b => b.to));
      if (eff.to !== edge) note('major', 'effective-band:' + f + ':' + c + ':' + m.id, { reported: eff.to, expected: edge });
      if (eff.graded !== rows.some(b => dmg(b) !== best)) note('major', 'effective-graded:' + f + ':' + c + ':' + m.id, { graded: eff.graded, mods: rows.map(dmg) });
      if (eff.to > m.maxRange) note('major', 'effective-beyond-reach:' + f + ':' + c + ':' + m.id, eff);
    }

    // key text: named modifiers must exist on the compiled band; missiles must not
    // show accuracy; "best modifiers" only on true maxima
    const keyText = FX.weaponRangeKey(m); keyRows++;
    const bestD = Math.max(...rows.map(dmg)), bestA = Math.max(...rows.map(b => b.toHitMod || 0));
    const spans = [...keyText.matchAll(/<span class="range-band-key"[^>]*>([\s\S]*?)<\/span>/g)].map(x => x[1]);
    spans.forEach((sp, i) => {
      const b = rows[i]; if (!b) return;
      const varied = rows.some(o => dmg(o) !== bestD || (m.kind !== 'missile' && (o.toHitMod || 0) !== bestA));
      const isBest = varied && dmg(b) === bestD && (m.kind === 'missile' || (b.toHitMod || 0) === bestA);
      if (/best modifiers/.test(sp) !== isBest) note('minor', 'key-best:' + f + ':' + c + ':' + m.id + ':' + i, sp);
      if (m.kind === 'missile' && /accuracy/.test(sp)) note('major', 'key-missile-accuracy:' + f + ':' + c + ':' + m.id, sp);
      if (!sp.includes(b.from + '–' + b.to + ' hex')) note('major', 'key-range:' + f + ':' + c + ':' + m.id + ':' + i, sp);
    });
    if (m.kind === 'missile' && (m.bands.some(b => b.toHitMod) || m.weapon.toHitBonus)) note('info', 'missile-has-tohit-field:' + f + ':' + c + ':' + m.id, { bands: m.bands });

    perMount.push({ hull: f + ':' + c, mount: m.id, kind: m.kind, arc: m.arc,
      arcName: AL.matchingArc(m.arc, t.arcs)?.name ?? null,
      maxRange: m.maxRange, effective: eff ? { to: eff.to, graded: eff.graded } : null,
      bands: rows.map(b => [b.from, b.to]) });
  }

  // GRADED BATTERY ENVELOPE (2026-09-07): each shaded tier must carry, at every
  // cell it covers, the best modifier any mount of that family offers there.
  for (const h of [0, 3]) {
    const ship = { ...s, facing: h };
    const battery = FX.batteryArcMarkup(ship, { project: xy, scale });
    for (const fam of [...battery.matchAll(/data-battery-family="(\w+)"[^>]*?>([\s\S]*?)<\/g>/g)]) {
      const kind = fam[1];
      const bestAt = new Map();
      for (const m of s.mounts.filter(x => x.kind === kind)) {
        const rows = FX.weaponRangeBands(m);
        for (const p of FX.weaponCoverageCells(ship, m)) {
          const band = rows[p.band]; if (!band) continue;
          const v = FX.bandDamage(m, band), k = key(p);
          if (!bestAt.has(k) || v > bestAt.get(k)) bestAt.set(k, v);
        }
      }
      for (const tier of [...fam[2].matchAll(/data-band-damage="(-?\d+)"[^>]*?d="([^"]+)"/g)]) {
        const value = +tier[1];
        for (const cell of decodeCells(tier[2])) {
          tierCells++;
          const expected = bestAt.get(key(cell));
          if (expected === undefined) note('major', 'tier-cell-not-covered:' + f + ':' + c + ':' + kind + ':h' + h, { cell, value });
          else if (expected !== value) note('major', 'tier-modifier:' + f + ':' + c + ':' + kind + ':h' + h, { cell, shaded: value, best: expected });
        }
      }
    }
  }

  // MOVEMENT CEILING. Reserve is round(fraction * power). Since the cannon came
  // under human control (2026-09-07) the outline takes an intent and a manual
  // flag, and a COLD bank under automatic control deliberately reports no radius
  // at all rather than promise one the engine may spend on charging. The oracle
  // asserts all three arms rather than treating the refusal as a defect.
  const spinalMount = s.mounts.find(m => m.kind === 'spinal');
  const coldBank = !!(s.spinal && s.spinal.state === 'charging' && !(s.spinal.charge > 0)
    && spinalMount?.weapon.immobileWhileCharging);
  for (const fr of [0, 0.3, 0.5, 1]) {
    const power = s.fullPower, reserve = Math.round(fr * power);
    const engineHexes = Math.max(0, Math.floor((power - reserve) / s.movementPointRatio));
    const auto = MV.movementRange(s, fr);
    const plantedNow = s.spinal && (s.spinal.state === 'ready' || (s.spinal.state === 'charging' && s.spinal.charge > 0))
      && spinalMount?.weapon.immobileWhileCharging;
    if (coldBank) {
      // Automatic: no radius, and a reason that says why.
      if (auto.hexes !== null) note('major', 'cold-bank-should-not-promise:' + f + ':' + c + ':r' + fr, auto);
      else if (!/cold/i.test(auto.reason || '')) note('minor', 'cold-bank-reason:' + f + ':' + c + ':r' + fr, auto.reason);
      // Manual, no intent: the bank stays cold, so the hull is simply mobile.
      const held = MV.movementRange(s, fr, undefined, true);
      if (held.hexes !== engineHexes) note('major', 'manual-hold-cold:' + f + ':' + c + ':r' + fr, { module: held.hexes, engine: engineHexes });
      // Manual, charging: the bank lights and plants the hull.
      const charging = MV.movementRange(s, fr, 'charge', true);
      if (charging.hexes !== 0) note('major', 'manual-charge-should-plant:' + f + ':' + c + ':r' + fr, charging);
    } else if (!plantedNow && !s.cloaked && auto.hexes !== engineHexes) {
      note('major', 'movement:' + f + ':' + c + ':r' + fr, { module: auto.hexes, engine: engineHexes });
    }
  }
  const v3 = coldBank ? MV.movementRange(s, 0.3, undefined, true) : MV.movementRange(s, 0.3);
  if (v3.hexes > 0) {
    const verts = []; MV.movementRangeMarkup(s, v3, p => { verts.push(p); return { x: 0, y: 0 }; });
    if (verts.length !== 6 || verts.some(p => H.distance(s.pos, p) !== v3.hexes)) note('major', 'outline-vertices:' + f + ':' + c, verts);
  }
}
const summary = {
  source, renderer: 'hex-grid outlines, decoded from the drawn path rather than the coverage helper',
  hulls, mounts, cellsChecked: cells, cellsDecoded: decoded, rotationChecked, tierCells,
  seamCells, seamMismatch, seamEngineTrueButUnshaded: seamEngineTrue, seamEngineFalseButShaded: seamEngineFalse,
  realMismatch, realMismatchAtMaxRange: atMaxMismatch, bandRows, keyRows, findings
};
writeFileSync(path.join(out, 'weapon-map-oracle.json'), JSON.stringify(summary, null, 2));
writeFileSync(path.join(out, 'per-mount.json'), JSON.stringify(perMount, null, 1));
console.log('oracle: ' + hulls + ' hulls / ' + mounts + ' mounts / 6 headings; ' + cells + ' hex cells checked, '
  + decoded + ' drawn cells decoded, ' + rotationChecked + ' rotation checks, ' + tierCells + ' graded-tier cells; seam cells '
  + seamCells + ' (rendered != engine on ' + seamMismatch + ': ' + seamEngineTrue + ' engine-covered but unshaded, '
  + seamEngineFalse + ' shaded but not covered); non-seam mismatches ' + realMismatch
  + ' of which at max range ' + atMaxMismatch + '; findings ' + findings.length);
for (const f of findings.slice(0, 40)) console.log(f.sev, f.id, JSON.stringify(f.detail).slice(0, 200));
