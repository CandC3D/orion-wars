import { fullPower, ratedPower, weaponFor, shieldCapacity, shieldCost, SHIELD_NUMBERS } from '../tactical/ship.js';
import { sideContacts, CONTACT_PROFILE } from '../tactical/contacts.js';
import { SENSING_PROFILE, operationalSensorRating } from '../tactical/sensing.js';
import { freezeTree } from './json.js';
import { specialCapabilities, SPECIAL_COMMAND_VERSION } from '../tactical/specials.js';
import { scanCapabilities, SCAN_COMMAND_VERSION, SCAN_MINIMUM_RATING } from '../tactical/scans.js';
import { SENSING_ORDER_VERSION } from './orders.js';
import { profilesFrom } from '../tactical/ship-command.js';
export const OBSERVATION_VERSION = 'captain-observation/2';
export const SENSING_OBSERVATION_VERSION = 'captain-observation/3';
const pick = (value, keys) => Object.fromEntries(keys.filter(k => value?.[k] !== undefined).map(k => [k, structuredClone(value[k])]));
const weaponFields = ['kind','maxPower','powerToArm','damage','spreadPer','firePower','chargeRequired','chargeDrawPerTurn','holdDrawPerTurn','cooldownTurns','toHitBonus','vsLightPenalty','evasionMultiplier','capitalPoints','holdForCapitalTurns','aimWeight','bypassShield','battleLinePoints','vsMediumPenalty','immobileWhileCharging','chargeStartRangeHexes'];
const band = b => pick(b, ['to','damageBonus','toHitMod','damageMod']);
function ownShip(s, tuning) {
  return {
    ...pick(s, ['id','faction','className','displayName','points','pos','facing','destroyed','superstructure','superstructureMax',
      'power','reserve','magazine','movementPointRatio','impulse','movedThisTurn','damageThisTurn','damageLastTurn','hullLostThisTurn','hullLostLastTurn','cloaked','decloaking','emergencyUsed','warpedThisTurn','toHitPenalty','systems']),
    fullPower: fullPower(s), ratedPower: ratedPower(s),
    specials:specialCapabilities(s,tuning),
    powerPhase: 'residual-before-arriving-missiles', refillIsForecast: true,
    turnRate: s.turnRate ?? tuning.movement?.turnRatePerRound?.[s.className] ?? 2,
    hull: pick(s.hull, ['impulsePower','magazine','sensorRating','pointDefence','screen','assault','weaponReach','commandRadius','commandDetectionBonus','commandToHit']),
    cores: s.cores.map(c => pick(c, ['id','name','power','alive','component'])),
    shields: SHIELD_NUMBERS.map(face => ({ face, capacity: shieldCapacity(s, face), remaining: s.shieldCap[face],
      down: !!s.shieldDown[face], powerPerDamage: shieldCost(s, face),
      ...pick(s.shieldGenerators?.[face], ['id','name','component']) })),
    mounts: s.mounts.map(m => ({ ...pick(m, ['id','type','kind','arcName','arc','maxRange','inop','firedThisTurn','position','orientation','displayName']),
      bands: m.bands.map(band), weapon: pick(weaponFor(s, m.type, tuning), weaponFields),
      cadence: { maxShotsPerTurn: 1, ammunitionPerShot: m.kind === 'missile' ? 1 : 0, magazineRefill: 'none-in-battle' } })),
    captain: s.captain ? pick(s.captain, ['id','name','posture']) : null,
    spinal: s.spinal ? pick(s.spinal, ['type','state','charge','cooldown','readyTurns','shots']) : null,
    squadrons: s.squadrons ? s.squadrons.map(q => pick(q, ['id','type','strength','max','launched','stance'])) : null
  };
}
// Shared restricted side view for future player UI and captains. Omniscient
// battleView remains exclusively the trusted recording/legacy presentation API.
export function sideView(battle, side) {
  const contacts = sideContacts(battle, side);
  const finite = battle.contacts.profile === SENSING_PROFILE;
  return freezeTree({
    contract: finite ? SENSING_OBSERVATION_VERSION : OBSERVATION_VERSION,
    contactProfile: finite ? SENSING_PROFILE : CONTACT_PROFILE, side, turn: battle.turn,
    ...(finite ? { sensing: structuredClone(battle.contacts.sensing), execution: 'engine-proof' } : {}),
    phase: 'pre-resolution', roundsPerTurn: battle.rounds,
    map: pick(battle.tuning.battle.map ?? { shape: 'hex', radiusHexes: battle.tuning.battle.mapRadiusHexes }, ['shape','widthHexes','heightHexes','radiusHexes']),
    terrain: battle.terrain.map(t => pick(t, ['type','q','r'])),
    rules: { arcs: Object.fromEntries(Object.entries(battle.tuning.arcs).filter(([,v]) => Array.isArray(v)).map(([k,v]) => [k,[...v]])),
      toHit: pick(battle.tuning.toHit, ['die','target','crewRatingDefault']),
      terrain: { asteroids: pick(battle.tuning.battle.terrainRules?.asteroids, ['moveCostMultiplier','blocksFire']),
        nebula: pick(battle.tuning.battle.terrainRules?.nebula, ['visibilityHexes','toHitPenalty','shieldsUseless']) },
      specialCommands:SPECIAL_COMMAND_VERSION,
      ...(finite ? { orderContract: SENSING_ORDER_VERSION,
        movement: { sameHexNoFire: battle.tuning.battle?.sameHexNoFire !== false }, scan: {
        contract: SCAN_COMMAND_VERSION, faces: [1,2,3,4,5,6], minimumOperationalRating: SCAN_MINIMUM_RATING,
        actionCost: 1, powerCost: 0, exclusive: true,
        facingBasis: 'ship-relative-at-execution',
        range: 'minimum-of-passive-radius-and-cloak-detection-range-plus-target-signature-and-friendly-command-bonus',
        baseRangeHexes: battle.tuning.cloak?.detectionRangeHexes ?? 0,
        terrainShadow: true, lockOwnership: 'acquiring-observer',
        ai: 'action-3-if-no-legal-shot; known-contact-centroid-sector-else-forward'
      } } : {}),
      hullPoints: Object.fromEntries(Object.entries(battle.tuning.hullClasses ?? {}).map(([k, v]) => [k, v.points])),
      captainProfiles: profilesFrom(battle.tuning),
      reserveBasis: 'post-refill-and-automatic-draws', damageDetail: 'sensor-rating-1-condition-2-brackets-3-intervals' },
    own: battle[side].map(s => ({ ...ownShip(s, battle.tuning),
      ...(finite ? { sensors: { operationalRating: operationalSensorRating(s, battle.tuning),
        passiveRadiusHexes: battle.contacts.sensing.passiveRadiusHexes[operationalSensorRating(s, battle.tuning)],
        scan: scanCapabilities(s, battle.tuning) } } : {})
    })).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    contacts,
    // Do not identify an unseen launcher or forward its location/type/pack key.
    incoming: battle.inFlight.filter(m => battle[side].some(s => s.id === m.targetId)).map(m => ({ targetId: m.targetId, arrival: 'before-next-refill' }))
  });
}
export const captainObservation = sideView;
