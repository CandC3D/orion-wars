export const FORMATION_PRESETS = {
  hold: { label: "Hold & fire", reserve: 0.4, turn: 0, movingRounds: 0 },
  advance: { label: "Advance & fire", reserve: 0.3, turn: 0, movingRounds: 2 },
  port: { label: "Wheel port", reserve: 0.35, turn: 1, movingRounds: 2 },
  starboard: { label: "Wheel starboard", reserve: 0.35, turn: -1, movingRounds: 2 }
};

// Produce ordinary per-ship orders: formation control is a planning shortcut,
// not a second movement system. Players may edit any vessel afterwards.
export function formationOrders(ships, rounds, presetName, planForShip) {
  const preset = FORMATION_PRESETS[presetName];
  if (!preset) throw new Error(`Unknown formation preset “${presetName}”.`);
  const orders = {};
  for (const ship of ships.filter((entry) => !entry.destroyed)) {
    const allowance = planForShip(ship);
    const available = allowance.fullPower * (1 - preset.reserve);
    const totalSteps = Math.max(0, Math.floor(available / Math.max(0.1, allowance.movementPointRatio)));
    const movingRounds = Math.min(rounds, preset.movingRounds);
    const assignedSteps = Math.min(totalSteps, movingRounds * 3);
    const baseForward = movingRounds ? Math.floor(assignedSteps / movingRounds) : 0;
    const extraSteps = movingRounds ? assignedSteps % movingRounds : 0;
    orders[ship.id] = {
      reserve: preset.reserve,
      target: "auto",
      plan: Array.from({ length: rounds }, (_, round) => ({
        turn: round === 0 ? Math.max(-allowance.turnRate, Math.min(allowance.turnRate, preset.turn)) : 0,
        forward: round < movingRounds ? baseForward + (round < extraSteps ? 1 : 0) : 0
      }))
    };
  }
  return orders;
}
