import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const _root = dirname(dirname(fileURLToPath(import.meta.url)));
const TUNING = JSON.parse(readFileSync(join(_root, "data", "tactical-tuning.json"), "utf8"));
const CARRIER_MIN = TUNING.strikeCraft?.minFleetPoints ?? 24;

// Scenario compositions and each power's sixth-hull fielding policy.
//
// Lives in its own module because three tools need to agree on it exactly:
// test/fleet-trial.js (the sweep), test/probe.js (instrumentation) and
// test/buy.js (the sixth-hull buy delta). A second copy of this table is a
// silent source of wrong measurements.

// Scenarios run anywhere from a two-point skirmish to a 64-point fleet action.
// Balance has to hold across the range, not just at the reference size.
export const SCALES = {
  2:  { frigate: 2 },
  8:  { "light-cruiser": 1, destroyer: 2 },
  16: { "heavy-cruiser": 1, destroyer: 2, frigate: 4 },
  24: { "heavy-cruiser": 1, "light-cruiser": 2, destroyer: 2, frigate: 4 },
  32: { battleship: 1, "light-cruiser": 2, destroyer: 2, frigate: 4 },
  64: { battleship: 2, "heavy-cruiser": 2, "light-cruiser": 2, destroyer: 2, frigate: 4 }
};
export const STANDARD = SCALES[24];

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
export const SIXTH = {
  EAR: { options: [{ hull: "dreadnought", cost: 8, from: { "light-cruiser": 2 } }] },
  VRA: { options: [{ hull: "monitor", cost: 16, from: { battleship: 1 } }] },
  ZAN: { corvetteSwap: true },
  KRE: { options: [
    { hull: "carrier", cost: 8, minPoints: CARRIER_MIN, from: { "heavy-cruiser": 1 } },
    { hull: "carrier", cost: 8, minPoints: CARRIER_MIN, from: { "light-cruiser": 2 } },
    { hull: "strike-cruiser", cost: 4, from: { "light-cruiser": 1 } }
  ] }
};

// Measurement escape hatch for the tuning tools ONLY. Nothing in the game reads
// KRE_SIXTH; it exists so alternative fielding policies can be run against each
// other without editing this file, and so the numbers in the comments above can
// be reproduced. Unset - the normal case - leaves the table exactly as written.
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
    out[opt.hull] = (out[opt.hull] ?? 0) + 1;
    return out;
  }
  return out;
}
