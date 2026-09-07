// The finite-sensing Scan contract, shared by packet validation and execution.
// No target query is used to decide whether a vessel may spend an action scanning.
import { operationalSensorRating } from './sensing.js';

export const SCAN_COMMAND_VERSION = 'sector-scan/1';
export const SCAN_MINIMUM_RATING = 2;

export function scanCapabilities(ship, tuning) {
  const reason = ship.destroyed ? 'vessel destroyed'
    : ship.cloaked || ship.decloaking ? 'cloak control'
    : operationalSensorRating(ship, tuning) < SCAN_MINIMUM_RATING ? 'operational sensor rating below 2'
    : null;
  return { available: reason === null, reason };
}

export function scanActionError(action, capability, enabled) {
  if (!enabled) return 'explicit scans require finite sensing';
  if (!Number.isSafeInteger(action.scan) || action.scan < 1 || action.scan > 6)
    return 'scan must name one face from 1 to 6';
  if (action.turn !== 0 || action.forward !== 0 ||
      Object.keys(action).some(k => !['turn', 'forward', 'scan'].includes(k)))
    return 'scan requires an exclusive action';
  if (!capability?.available) return capability?.reason ?? 'scan unavailable';
  return null;
}
