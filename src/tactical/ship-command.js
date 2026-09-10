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

// Except on a hull that plants itself. A spinal bank makes the ship immobile while it charges, so
// its whole function is to stand still and be shot at - and a captain who breaks off the charge
// takes away the only thing it does. Measured on 2026-09-09: standard officers throughout cost the
// Federation eight points against the Krelath and moved nothing else in the corpus, and a bold
// gunstar captain restored it exactly. See docs/balance-2026-09-09-captains.md.
//
// Chris's ruling, and the reference is his: like Okita. The Federation gives these ships to officers
// chosen for nerve. It is the same source Supreme Leader Stratan Valdar is drawn from, so the two
// flagship commanders of the campaign come from opposite sides of one story.
export const SPINAL_POSTURE = 'bold';
export const carriesSpinal = ship =>
  !!ship?.spinal || (Array.isArray(ship?.mounts) && ship.mounts.some(m => m?.kind === 'spinal'));
export const defaultPostureFor = ship => carriesSpinal(ship) ? SPINAL_POSTURE : DEFAULT_POSTURE;

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
    const who = name ? name + ' ' : '', grounds = `inside ${profile.minRangeHexes} hexes at ${Math.round(hullFraction(ship) * 100)}% hull`;
    return {
      rule: 'will-not-close',
      enemyId: foe.id ?? null,
      range: now,
      reason: `${who}will not close ${grounds}`,
      // The admiral may insist, and then the ship closes anyway. It is still worth hearing what the
      // officer thought of it: an objection on the record is the difference between a crew that
      // obeys and a crew that agrees, and the campaign layer will want to know which this was.
      protest: `${who}closes under protest: would not close ${grounds}`,
      // And a third register, for a caller judging from a picture rather than from truth. The
      // console must never put the flat sentence in front of a player: it reaches its verdict from
      // contact reports, which can be wrong about the enemy, so what it can honestly report is that
      // the captain MAY refuse. Reported by Astra 2026-09-09 - a promise the implementation cannot
      // keep is not made honest by a certainty flag the player never sees.
      possible: `${who}may refuse to close ${grounds}`
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
  // Hull actually lost, NOT incoming fire. Reported by Astra 2026-09-09: reading the incoming
  // counter made a fully healthy hull vent a 40-point charge because one hit was absorbed, and
  // then report "9% hull lost" on a ship at 53 of 53. The rule is about being killed sitting
  // still, so a shield that held is not a reason to throw the charge away.
  const took = (ship.hullLostLastTurn ?? 0) / max;
  if (took < threshold) return null;
  const who = name ? name + ' ' : '', grounds = `${Math.round(took * 100)}% hull lost while planted`;
  return {
    rule: 'breaks-charge',
    took,
    reason: `${who}breaks off the charge: ${grounds}`,
    protest: `${who}holds the charge under protest: ${grounds}`,
    possible: `${who}may break off the charge: ${grounds}`
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

// ---------------------------------------------------------------- reading the plot
//
// Everything above decides from truth, because the resolver has truth. The console does not: it has
// contact reports. So that the SAME rules can be declared before the player commits, a contact is
// appraised into the shape the rules read - and the two things the rules need are not directly
// observable, so both are read the way a bridge crew would read them:
//
//   weight     nominal points for the reported class, from the published ladder. A refit is invisible.
//   condition  the TOP of the observed damage interval. A contact reported only as "damaged" is
//              therefore treated as very nearly whole.
//
// Both readings are deliberately generous to the enemy, which means the captain states his objection
// whenever the plot leaves room for it. The opposite bias would have him assume the enemy is weak,
// stay silent, and then refuse at execution - a surprise, which is the one thing the ruling forbids.

// The top of the reported damage interval. 'damaged' spans up to whole at every detail level, so it
// yields 1: the sensors have not ruled out an undamaged ship.
function observedCeiling(damage) {
  if (!damage) return 1;
  if (damage.detail === 'interval') return damage.remainingFraction?.max ?? 1;
  if (damage.condition === 'critical') return 0.25;
  if (damage.condition === 'heavily-damaged') return 0.5;
  return 1;
}

// A contact report as the decision rules read it. Scaled to a nominal 1000 so no integer assumption
// downstream can round an appraisal onto the wrong side of a threshold.
export function appraiseContact(contact, hullPoints) {
  if (contact.destroyed) throw new Error('A wreck cannot be appraised as a combatant');
  const max = 1000;
  return {
    id: contact.id, className: contact.className, faction: contact.faction,
    pos: { q: contact.pos.q, r: contact.pos.r }, facing: contact.facing,
    destroyed: false, cloaked: false,
    points: hullPoints?.[contact.className] ?? 0,
    superstructureMax: max, superstructure: Math.round(observedCeiling(contact.observedDamage) * max),
    appraised: true
  };
}
