// COMBAT INTERFACE — frozen early per the brief (§9). The strategic layer may
// depend only on this shape, never on a resolver's internals.
//
// resolve(context) -> outcome
//   context: {
//     location,                // node id
//     forces,                  // [{ faction, fleets: [fleetSnapshot] }]
//     starbase,                // boolean: friendly starbase at node
//     nebula,                  // boolean: Azure Nebula node
//     supply,                  // { [faction]: boolean } — in-supply flags
//     rng                      // the game PRNG (all randomness through it)
//   }
//   outcome: {
//     resolved,                // false → stand-off, no losses (Phase 1 stub)
//     victor,                  // faction id or null (mutual retreat / stand-off)
//     losses,                  // { [fleetId]: { [classId]: countDestroyed } }
//     retreats                 // { [fleetId]: nodeIdRetreatedTo }
//   }
//
// Implementations planned: watched battle (fleet-action trial sim), instant
// resolution (same sim headless), future FASA hex engine.

// Phase 1 stub: hostile fleets at one node produce a logged stand-off.
// Replaced in Phase 2 by the ported trial sim.
export const placeholderResolver = {
  resolve(context) {
    return { resolved: false, victor: null, losses: {}, retreats: {} };
  }
};
