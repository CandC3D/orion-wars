// The ship captain: a declared decision layer between the admiral's order and the hull.
//
// This module decides only two things, and it decides them from the ship's own state plus the
// enemies the resolver already hands to per-ship logic. It has no memory, no randomness, no clock
// and no access to hidden battle state, so the same inputs always give the same answer and every
// recorded battle stays reproducible.
//
// The governing constraint, from docs/consultations/fable-ship-captains-2026-09-07/recommendation.md
// section 4: a captain may only deviate in ways that are DECLARED BEFORE the player commits and
// REPORTED AFTER execution, and the admiral can always insist. Silence means compliance. There is no
// general initiative roll here and there must never be one, or the console stops being trustworthy.
//
// Naming: src/captains/ is the INFORMATION layer (what a side may see). This is the DECISION layer.
import { distance } from './hex.js';

// Posture is temperament, not a command: it is a standing per-ship setting, carried between turns.
// Thresholds live here as named profiles so a campaign character is later a profile plus a name plus
// a record, with no second resolver change needed. Crew quality attaches the same way.
export const DEFAULT_PROFILES = {
  // Closes with anything, never breaks off. The captain who gets a medal or gets everyone killed.
  bold: {
    label: 'Bold',
    minRangeHexes: 0,          // will close to contact
    holdBelowHull: 0,          // hull fraction under which the range rule engages at all
    heavierRatio: Infinity,    // no enemy counts as "heavier"
    enemyIntactAbove: 1.01,    // no enemy counts as "undamaged"
    ventUnderFireDamage: null  // never breaks a charge
  },
  // The service default. Will press an attack, but not into a fresh heavy while badly hurt.
  standard: {
    label: 'Standard',
    minRangeHexes: 3,
    holdBelowHull: 0.35,
    heavierRatio: 1.25,
    enemyIntactAbove: 0.8,
    ventUnderFireDamage: 0.15  // fraction of max hull taken last turn while planted
  },
  // Keeps the ship. Will be accused of timidity by admirals who have never lost one.
  cautious: {
    label: 'Cautious',
    minRangeHexes: 5,
    holdBelowHull: 0.55,
    heavierRatio: 1.0,
    enemyIntactAbove: 0.6,
    ventUnderFireDamage: 0.08
  }
};

export const DEFAULT_POSTURE = 'standard';

// tuning.captainProfiles may override any field of any profile. Missing tuning is not an error: the
// module is usable standalone, which is what makes it unit-testable without a battle.
export function profilesFrom(tuning) {
  const supplied = tuning?.captainProfiles ?? {};
  const out = {};
  for (const [name, base] of Object.entries(DEFAULT_PROFILES)) out[name] = { ...base, ...(supplied[name] ?? {}) };
  for (const [name, extra] of Object.entries(supplied)) if (!out[name]) out[name] = { ...DEFAULT_PROFILES.standard, ...extra };
  return out;
}

// The captain record on a ship. Identity is carried even when it holds nothing but a posture, so the
// campaign layer inherits a real key rather than a synthetic one bolted on later.
export function captainOf(ship, tuning) {
  const profiles = profilesFrom(tuning);
  const record = ship?.captain ?? null;
  const posture = record?.posture && profiles[record.posture] ? record.posture : DEFAULT_POSTURE;
  return {
    id: record?.id ?? null,
    name: record?.name ?? null,
    posture,
    profile: profiles[posture]
  };
}

function hullFraction(ship) {
  const max = ship?.superstructureMax ?? 0;
  if (!(max > 0)) return 1;
  return Math.max(0, ship.superstructure ?? 0) / max;
}

// Would this captain refuse to end a step here?
//
// The rule: while hurt, do not close inside minRangeHexes of an enemy that is both heavier and still
// largely intact. It fires only on a step that actually SHORTENS the range - a ship already inside
// the threshold may still manoeuvre, and may open the range freely, because refusing to move at all
// would be worse than the order it is refusing.
//
// Returns null when the captain is content, or { rule, reason, enemyId, range } when it is not.
export function refusesStep(ship, from, next, enemies, tuning) {
  const { profile, name } = captainOf(ship, tuning);
  if (!(profile.minRangeHexes > 0)) return null;
  if (hullFraction(ship) > profile.holdBelowHull) return null;
  const mine = ship?.points ?? 0;
  for (const foe of enemies ?? []) {
    if (!foe || foe.destroyed || !foe.pos) continue;
    if ((foe.points ?? 0) < mine * profile.heavierRatio) continue;
    if (hullFraction(foe) < profile.enemyIntactAbove) continue;
    const was = distance(from, foe.pos);
    const now = distance(next, foe.pos);
    if (now >= was) continue;                    // opening or holding the range is always allowed
    if (now >= profile.minRangeHexes) continue;  // still outside the line the captain will not cross
    return {
      rule: 'will-not-close',
      enemyId: foe.id ?? null,
      range: now,
      reason: `${name ? name + ' ' : ''}will not close inside ${profile.minRangeHexes} hexes at ${Math.round(hullFraction(ship) * 100)}% hull`
    };
  }
  return null;
}

// Would this captain break off a charge rather than be killed sitting still?
//
// A spinal bank that is charging or held plants the hull. Under fire, that is a slow death, and the
// engine already offers the way out: vent. This decides only that venting is warranted; the engine's
// own vent path does the work, at its own cost, with no discount.
//
// Honest naming: this detects being hurt while planted, from own state only. It covers the
// strike-craft case that motivated the rule without pretending to identify what is shooting.
export function ventsUnderFire(ship, tuning) {
  const { profile, name } = captainOf(ship, tuning);
  const threshold = profile.ventUnderFireDamage;
  if (threshold == null) return null;
  const st = ship?.spinal;
  if (!st) return null;
  const planted = st.state === 'ready' || (st.state === 'charging' && (st.charge ?? 0) > 0);
  if (!planted) return null;
  const mount = (ship.mounts ?? []).find(m => m.kind === 'spinal');
  if (!mount || mount.inop) return null;
  const max = ship.superstructureMax ?? 0;
  if (!(max > 0)) return null;
  const took = (ship.damageLastTurn ?? 0) / max;
  if (took < threshold) return null;
  return {
    rule: 'breaks-charge',
    took,
    reason: `${name ? name + ' ' : ''}breaks off the charge: ${Math.round(took * 100)}% hull lost while planted`
  };
}

// Everything a captain would do to this order under the current picture, for the preview to declare
// before the player commits. The resolver reports the same rules after execution; the console shows
// both from the same source, which is what keeps "declared" and "reported" honest.
export function captainReview(ship, plannedEnds, enemies, tuning) {
  const notes = [];
  const from = ship?.pos;
  if (from) {
    let cursor = from;
    for (const end of plannedEnds ?? []) {
      if (!end) continue;
      const refusal = refusesStep(ship, cursor, end, enemies, tuning);
      if (refusal) { notes.push(refusal); break; }
      cursor = end;
    }
  }
  const vent = ventsUnderFire(ship, tuning);
  if (vent) notes.push(vent);
  return notes;
}
