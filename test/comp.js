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
  18:  { "light-cruiser": 1, destroyer: 2 },
  32:  { "heavy-cruiser": 1, destroyer: 2, frigate: 4 },
  52:  { "heavy-cruiser": 1, "light-cruiser": 2, destroyer: 2, frigate: 4 },
  68:  { battleship: 1, "light-cruiser": 2, destroyer: 2, frigate: 4 },
  132: { battleship: 2, "heavy-cruiser": 2, "light-cruiser": 2, destroyer: 2, frigate: 4 }
};
export const STANDARD = SCALES[52];

// Each power fields its own unique hulls, paying for them out of the common
// hulls so the sweep tests the hull rather than handing its owner free points.
//
// Keys of SCALES are fleet costs on the REFINED ladder (2026-09-02 referee):
// corvette 1 / FF 2 / DD 4 / strike cruiser 8 / CL 10 / CA 16 / dreadnought 16
// / carrier 16 / monitor 20 / BB 32, limit one on the three specials. Every
// price except the Zandrax corvette is EVEN, which is what makes each swap
// below exact: the frigate at 2 is the smallest hull three of the four powers
// own, so an odd price could not be paid.
//
// The memorable identities, and every swap in this table:
//   2 corvettes = 1 frigate          2 frigates    = 1 destroyer
//   2 destroyers = 1 strike cruiser  strike cruiser + 1 frigate = 1 light cruiser
//   8 frigates  = 1 heavy cruiser    2 light cruisers = 1 monitor
//   dreadnought = carrier = 1 heavy cruiser = 1 light cruiser + 3 frigates
//   2 heavy cruisers = 1 battleship
//
// CARRIER_MIN (tuning.strikeCraft.minFleetPoints, now 52) is the fleet floor
// for all three 16-20 point specials, and it is load-bearing rather than
// cosmetic. Measured on the owner's own mirror at 160 battles a cell, a fleet
// that buys its special reads 91% (monitor) / 58% (dreadnought) / 52% (carrier)
// at 32 points and 52 / 53 / 47 at 52 points: below the floor the special IS
// the list. The strike cruiser carries its own floor of 32 for the same reason
// (77% mirror and +33pp of buy delta in an 18-point list, 50% and +8pp at 32).
export const SIXTH = {
  EAR: { options: [
    { hull: "dreadnought", cost: 16, minPoints: CARRIER_MIN, from: { "heavy-cruiser": 1 }, add: { dreadnought: 1 } },
    { hull: "dreadnought", cost: 16, minPoints: CARRIER_MIN, from: { "light-cruiser": 1, frigate: 3 }, add: { dreadnought: 1 } }
  ] },
  VRA: { options: [
    { hull: "monitor", cost: 20, minPoints: CARRIER_MIN, from: { "heavy-cruiser": 1, frigate: 2 }, add: { monitor: 1 } },
    { hull: "monitor", cost: 20, minPoints: CARRIER_MIN, from: { "light-cruiser": 2 }, add: { monitor: 1 } }
  ] },
  ZAN: { corvetteSwap: true },
  KRE: { options: [
    { hull: "carrier", cost: 16, minPoints: CARRIER_MIN, from: { "heavy-cruiser": 1 }, add: { carrier: 1 } },
    { hull: "carrier", cost: 16, minPoints: CARRIER_MIN, from: { "light-cruiser": 1, frigate: 3 }, add: { carrier: 1 } },
    { hull: "strike-cruiser", cost: 8, minPoints: 32, from: { "light-cruiser": 1 }, add: { "strike-cruiser": 1, frigate: 1 } },
    { hull: "strike-cruiser", cost: 8, minPoints: 32, from: { destroyer: 2 }, add: { "strike-cruiser": 1 } }
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
