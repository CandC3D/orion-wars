// Fleet-construction rules shared by the headless resolver and browser tools.
// Keep constraints in tactical-tuning.json so every entry point enforces the
// same rule instead of relying on the balance harness's composition policy.

import { validatePack } from '../construction/index.js';

export function fleetPoints(side, tuning) {
  return (side?.ships || []).reduce((total, ship) =>
    total + (Number(ship.designPack?.design?.hull?.points ?? tuning?.hullClasses?.[ship.className]?.points) || 0), 0);
}

export function rosterFor(faction, tuning) {
  const roster = tuning?.rosters?.[faction];
  if (Array.isArray(roster)) return roster;
  return Object.keys(tuning?.hullClasses || {}).filter((name) => name !== "command-ship");
}

export function compositionFor(side) {
  const composition = {};
  for (const ship of side?.ships || []) composition[ship.className] = (composition[ship.className] || 0) + 1;
  return composition;
}

function fleetConstraintIssues(side, tuning, label) {
  const errors = [], floors = [];
  const composition = compositionFor(side);
  const total = fleetPoints(side, tuning);
  for (const [className, count] of Object.entries(composition)) {
    const hull = tuning?.hullClasses?.[className];
    if (!hull) continue;
    if (Number.isFinite(hull.limit) && count > hull.limit) {
      errors.push(`${label} fields ${count} ${className}(s); the limit is ${hull.limit}.`);
    }
    if (count > 0 && Number.isFinite(hull.minFleetPoints) && total < hull.minFleetPoints) {
      floors.push(`${label} fields ${className}, which requires a fleet of at least ${hull.minFleetPoints} points (currently ${total}).`);
    }
  }
  return { errors, floors };
}

// Composition builders and measurement callers remain strict by default.
export function fleetConstraintErrors(side, tuning, label = "Fleet") {
  const { errors, floors } = fleetConstraintIssues(side, tuning, label);
  return [...errors, ...floors];
}

export function fleetRosterErrors(side, tuning, label = "Fleet") {
  const roster = rosterFor(side?.faction, tuning);
  return (side?.ships || []).flatMap((ship, index) =>
    tuning?.hullClasses?.[ship.className] && !roster.includes(ship.className)
      ? [`${label} ship ${index + 1} (${ship.className}) cannot be fielded by ${side.faction}.`]
      : []);
}

export function fleetRuleIssues(side, tuning, label = "Fleet", { fleetFloorPolicy = "strict" } = {}) {
  if (!["strict", "warn"].includes(fleetFloorPolicy)) throw new Error(`Unknown fleet floor policy: ${fleetFloorPolicy}`);
  const designs = (side?.ships || []).flatMap((ship, i) => ship.designPack === undefined ? [] :
    validatePack(ship.designPack, tuning, { faction: side.faction, className: ship.className }).map(e => `${label} ship ${i+1}: ${e}`));
  const { errors, floors } = fleetConstraintIssues(side, tuning, label);
  return {
    errors: [...designs, ...fleetRosterErrors(side, tuning, label), ...errors, ...(fleetFloorPolicy === "strict" ? floors : [])],
    warnings: fleetFloorPolicy === "warn" ? floors : []
  };
}

export function fleetRuleErrors(side, tuning, label = "Fleet") {
  return fleetRuleIssues(side, tuning, label).errors;
}
