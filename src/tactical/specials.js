// Public capabilities, not a promise of execution: power, contacts, terrain and
// the shared fleet quota are checked when the action actually resolves.
import {fullPower} from './ship.js';
export const SPECIAL_COMMAND_VERSION = 'tactical-specials/1';
export function specialCapabilities(ship, tuning) {
  const warp=tuning.warpJump, burst=tuning.emergencyManoeuvre;
  return {
    warp: warp?.factions?.includes(ship.faction) ? {
      rangeHexes:warp.rangeHexes, powerCostFraction:warp.powerCostFraction,
      powerCost:Math.round(fullPower(ship)*warp.powerCostFraction),
      oncePerTurn:!!warp.oncePerTurn, fleetFraction:warp.fleetFraction??1,
      minGain:warp.minGain??0, requireRearArc:!!warp.requireRearArc,
      targeting:'selected-contact-or-nearest; standard insertion solution', spendsReserve:true
    } : null,
    burst: burst?.factions?.includes(ship.faction) ? {
      maxExtraHexes:burst.extraHexes, stressDamage:burst.stressDamage,
      toHitPenalty:burst.toHitPenalty, oncePerTurn:true, powerCost:0
    } : null
  };
}
