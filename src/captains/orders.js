import { jsonCopy } from './json.js';
import { SENSING_PROFILE } from '../tactical/sensing.js';
import { scanActionError } from '../tactical/scans.js';
export const ORDER_VERSION = 'captain-orders/2';
export const SENSING_ORDER_VERSION = 'captain-orders/3';
export const FALLBACK_RESERVE = 0.30;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function shape(v, keys, label) {
  if (!object(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) throw new Error(`Invalid ${label} shape`);
}
export function allHoldOrders(observation) {
  return Object.fromEntries(observation.own.filter(s => !s.destroyed).map(s => [s.id, {
    plan: Array.from({ length: observation.roundsPerTurn }, () => ({ turn: 0, forward: 0 })),
    target: 'auto', reserve: FALLBACK_RESERVE
  }]));
}
export function validateOrders(observation, input) {
  try {
    const packet = jsonCopy(input, { bytes: 262144, depth: 8 });
    if (!object(packet)) throw new Error('Orders must be an object');
    const ships = new Map(observation.own.filter(s => !s.destroyed).map(s => [s.id, s]));
    const targets = new Set(observation.contacts.map(c => c.id));
    const orders = allHoldOrders(observation), adjustments = [];
    const m = observation.map;
    // Public geometric ceiling only. Affordability is resolved after arriving
    // missiles/refill/draws, at each actual step, by the engine's normal clamp.
    const cap = Math.ceil(m.shape === 'rect' ? m.widthHexes + 2 * m.heightHexes + 2 : 2 * m.radiusHexes + 2);
    if (!Number.isSafeInteger(cap) || cap < 1) throw new Error('Invalid movement map');
    for (const [id, o] of Object.entries(packet)) {
      const ship = ships.get(id);
      if (!ship) throw new Error('Order does not name an owned living ship');
      shape(o, Object.hasOwn(o??{},'spinal')?['plan','target','reserve','spinal']:['plan','target','reserve'], 'ship order');
      if(Object.hasOwn(o,'spinal')&&(!ship.spinal||!['charge','vent'].includes(o.spinal)))throw new Error('Invalid spinal intent');
      if (!Array.isArray(o.plan) || o.plan.length !== observation.roundsPerTurn) throw new Error('Wrong action count');
      if (!Number.isFinite(o.reserve)) throw new Error('Reserve must be finite');
      if (typeof o.target !== 'string' || (o.target !== 'auto' && !targets.has(o.target))) throw new Error('Target is not a current contact');
      const clamp = (value, min, max, field) => {
        const accepted = Math.max(min, Math.min(max, value));
        if (accepted !== value) adjustments.push({ shipId: id, field, requested: value, accepted });
        return accepted;
      };
      orders[id] = { target: o.target, reserve: clamp(o.reserve, 0, 1, 'reserve'), plan: o.plan.map((p, index) => {
        if(!object(p)||!Object.hasOwn(p,'turn')||!Object.hasOwn(p,'forward')||Object.keys(p).some(k=>!['turn','forward','warp','burst','scan'].includes(k)))throw new Error('Invalid action shape');
        if (!Number.isSafeInteger(p.turn) || !Number.isSafeInteger(p.forward)) throw new Error('Action values must be safe integers');
        if (Object.hasOwn(p, 'scan')) {
          const error = scanActionError(p, ship.sensors?.scan, observation.contactProfile === SENSING_PROFILE);
          if (error) throw new Error(error);
        }
        if(Object.hasOwn(p,'warp')&&(p.warp!==true||!ship.specials?.warp||p.turn!==0||p.forward!==0||Object.hasOwn(p,'burst')))throw new Error('Warp requires a fitted vessel and an exclusive action');
        if(Object.hasOwn(p,'burst')&&(!Number.isSafeInteger(p.burst)||!ship.specials?.burst))throw new Error('Burst requires a fitted vessel and an integer extra-hex count');
        const action={ turn: clamp(p.turn, -ship.turnRate, ship.turnRate, `plan.${index}.turn`),
          forward: clamp(p.forward, 0, cap, `plan.${index}.forward`) };
        if(p.warp===true)action.warp=true;
        if(Object.hasOwn(p,'scan'))action.scan=p.scan;
        if(Object.hasOwn(p,'burst'))action.burst=clamp(p.burst,0,ship.specials.burst.maxExtraHexes,`plan.${index}.burst`);
        return action;
      }) };
      if(Object.hasOwn(o,'spinal'))orders[id].spinal=o.spinal;
    }
    for (const id of ships.keys()) if (!Object.hasOwn(packet, id)) adjustments.push({ shipId: id, field: 'omitted-ship', accepted: 'hold-auto-reserve-0.30' });
    return { ok: true, orders, adjustments, faults: [] };
  } catch (error) {
    return { ok: false, orders: allHoldOrders(observation), adjustments: [], faults: [{ code: 'invalid-orders', detail: error.message }] };
  }
}
export function acceptDecision(observation, output, previousMemory = null) {
  try {
    // Validate descriptors before reading output.orders or invoking toJSON.
    const copy = jsonCopy(output, { bytes: 327680, depth: 16, nodes: 40000 });
    shape(copy, ['orders','memory'], 'captain output');
    const memory = jsonCopy(copy.memory);
    const accepted = validateOrders(observation, copy.orders);
    return { ...accepted, memory: accepted.ok ? memory : jsonCopy(previousMemory) };
  } catch (error) {
    return { ok: false, orders: allHoldOrders(observation), memory: jsonCopy(previousMemory), adjustments: [],
      faults: [{ code: 'invalid-output', detail: error.message }] };
  }
}
