import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const _root = dirname(dirname(fileURLToPath(import.meta.url)));
const TUNING = JSON.parse(readFileSync(join(_root, "data", "tactical-tuning.json"), "utf8"));
const CARRIER_MIN = TUNING.strikeCraft?.minFleetPoints ?? 62; // fleet floor for every 32-point special

// Scenario compositions and each power's sixth-hull fielding policy.
//
// Lives in its own module because three tools need to agree on it exactly:
// test/fleet-trial.js (the sweep), test/probe.js (instrumentation) and
// test/buy.js (the sixth-hull buy delta). A second copy of this table is a
// silent source of wrong measurements.

// Scenarios run anywhere from a two-point skirmish to a 64-point fleet action.
// Balance has to hold across the range, not just at the reference size.
export const SCALES = {
  4:   { frigate: 2 },
  22:  { "light-cruiser": 1, destroyer: 2 },
  38:  { "heavy-cruiser": 1, destroyer: 2, frigate: 4 },
  62:  { "heavy-cruiser": 1, "light-cruiser": 2, destroyer: 2, frigate: 4 },
  70:  { battleship: 1, "light-cruiser": 2, destroyer: 2, frigate: 4 },
  138: { battleship: 2, "heavy-cruiser": 2, "light-cruiser": 2, destroyer: 2, frigate: 4 }
};
export const STANDARD = SCALES[62];

// Each power fields its own unique hulls, paying for them out of the common
// hulls so the sweep tests the hull rather than handing its owner free points.
//
// KRELATH own TWO: the strike cruiser and the carrier (ruling: the first
// carrier is theirs). `options` is tried in order and the first affordable
// entry is taken. The resulting ladder, and why each rung is where it is:
//
//   2   nothing        - as for every power.
//   8   strike cruiser - bought from the one light cruiser. This is the fix for
//                        the 8-point dip: Krelath sat at 34% in that cell for
//                        the single reason that they were the only power with a
//                        unique hull they could not afford anywhere near it.
//                        Worth +16 to +22pp across four seed sets, which is a
//                        large buy and is reported as such - it is large because
//                        the cell was broken, not because the hull is.
//   16  nothing        - the carrier's floor is 24 points; see the comment on
//                        minPoints in compFor below. Earth and Vraygon field
//                        nothing at 16 either, so this is the normal case.
//   24  carrier        - out of the heavy cruiser.
//   32  carrier        - out of two light cruisers, there being no heavy cruiser
//                        in that list. Same 8 points, and it is the buy a
//                        commander would actually make: the strike cruiser was
//                        measured here and is a -5.7pp purchase.
//   64  carrier        - out of a heavy cruiser again. Paying with two light
//                        cruisers instead was measured at -2.5pp against the
//                        heavy cruiser's +9.1pp, and the cheaper-looking number
//                        is NOT the one to take: a commander trades the hull he
//                        values least, and this fleet values the second heavy
//                        cruiser least. Picking the swap that measures worst
//                        would be gaming the instrument.
// Keys of SCALES are fleet costs on the 2026-09-02 ladder (corvette 1 / FF 2 /
// DD 5 / CS 8 / CL 12 / CA 20 / BB 28 / specials 32). The hull lists are the
// same six fleets the sweep has always used. Every swap below is equal-points
// on that ladder: a special (32) = BB 28 + 2 FF, or CA 20 + CL 12; strike
// cruiser 8 + 2 FF = CL 12; two corvettes = one frigate. `add` lists what
// the swap puts in.
export const SIXTH = {
  EAR: { options: [
    { hull: "dreadnought", cost: 32, minPoints: CARRIER_MIN, from: { battleship: 1, frigate: 2 }, add: { dreadnought: 1 } },
    { hull: "dreadnought", cost: 32, minPoints: CARRIER_MIN, from: { "heavy-cruiser": 1, "light-cruiser": 1 }, add: { dreadnought: 1 } }
  ] },
  VRA: { options: [
    { hull: "monitor", cost: 32, minPoints: CARRIER_MIN, from: { battleship: 1, frigate: 2 }, add: { monitor: 1 } },
    { hull: "monitor", cost: 32, minPoints: CARRIER_MIN, from: { "heavy-cruiser": 1, "light-cruiser": 1 }, add: { monitor: 1 } }
  ] },
  ZAN: { corvetteSwap: true },
  KRE: { options: [
    { hull: "carrier", cost: 32, minPoints: CARRIER_MIN, from: { battleship: 1, frigate: 2 }, add: { carrier: 1 } },
    { hull: "carrier", cost: 32, minPoints: CARRIER_MIN, from: { "heavy-cruiser": 1, "light-cruiser": 1 }, add: { carrier: 1 } },
    { hull: "strike-cruiser", cost: 8, from: { "light-cruiser": 1 }, add: { "strike-cruiser": 1, frigate: 2 } }
  ] }
};

const ALT = {
  // the carrier-only policy this table replaced (carrier from 16 points up)
  carrier: (o) => o.filter((x) => x.hull === "carrier" && "heavy-cruiser" in x.from)
    .map((x) => ({ ...x, minPoints: 16 })),
  none: () => [],
  "sc-only": (o) => o.filter((x) => x.hull === "strike-cruiser"),
  "carrier-32": (o) => o.map((x) => (x.hull === "carrier" ? { ...x, minPoints: 32 } : x)),
  // pay for the carrier with light cruisers wherever that is possible
  "cl-first": (o) => [o[1], o[0], o[2]]
};
if (process.env.KRE_SIXTH && ALT[process.env.KRE_SIXTH]) {
  SIXTH.KRE.options = ALT[process.env.KRE_SIXTH](SIXTH.KRE.options);
}

// Build a faction's actual list for a composition: swap in its unique hull when
// the budget allows, keeping the point total identical.
export function compFor(faction, comp, tuning, plain = null) {
  const out = { ...comp };
  const pts = Object.entries(comp).reduce((s, [k, n]) => s + tuning.hullClasses[k].points * n, 0);
  const spec = SIXTH[faction];
  if (!spec) return out;
  if (plain && plain.includes(faction)) return out;   // measurement only: no unique hull
  if (spec.corvetteSwap) {
    // Zandrax trade a frigate for two corvettes wherever they have one.
    if (out.frigate >= 2) { out.frigate -= 2; out.corvette = (out.corvette ?? 0) + 4; }
    return out;
  }
  for (const opt of spec.options) {
    // Too small a scenario to justify it. The default floor is twice the hull's
    // price - a list should never be more than half one ship - and an option may
    // raise it. The carrier does: at 16 points it would be bought out of the
    // fleet's ONLY capital, and measured, a Krelath 16-point list of two
    // destroyers, four frigates and a flight deck either wins 91-93% of the cell
    // (with the air group) or 0-1% of it (without), because half the fighting
    // power of the list is in aircraft. A flight deck needs a fleet to screen it
    // and 16 points is not one.
    if (pts < (opt.minPoints ?? opt.cost * 2)) continue;
    let ok = true;
    for (const [k, n] of Object.entries(opt.from)) if ((out[k] ?? 0) < n) ok = false;
    if (!ok) continue;
    for (const [k, n] of Object.entries(opt.from)) {
      out[k] -= n;
      if (out[k] <= 0) delete out[k];
    }
    for (const [k, n] of Object.entries(opt.add ?? { [opt.hull]: 1 })) out[k] = (out[k] ?? 0) + n;
    return out;
  }
  return out;
}
