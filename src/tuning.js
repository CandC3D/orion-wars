// ============================================================================
// TUNING — the single table of every load-bearing balance constant.
// Nothing in the engine may hard-code a number that belongs here.
// Four powers: EAR Earth Federation, VRA Vraygon Star Realm,
//              ZAN Zandrax Horde, KRE Krelath Empire.
// ============================================================================

export const TUNING = {
  // --- War clock (open ruling: provisional 48 monthly turns) ---
  warLengthTurns: 48,

  // --- Economy ---
  // World production per turn = world.size * productionPerSize (world data may
  // override with an explicit `production` value), then scaled by the owner's
  // incomeMult below.
  productionPerSize: 2,
  startingPoints: { EAR: 30, VRA: 34, ZAN: 30, KRE: 24 },
  // Vraygon is the richest power, Krelath the poorest — the economic axis.
  incomeMult: { EAR: 1.0, VRA: 1.25, ZAN: 1.0, KRE: 0.85 },

  // --- Supply ---
  // A node/fleet is in supply if reachable from a friendly starbase or outpost
  // within supplyRadius lane-hops, tracing only through nodes not enemy-owned.
  supplyRadius: 3,
  outOfSupplyMovePenalty: 1,   // extra turns per lane hop when out of supply
  outOfSupplyCombatMult: 0.5,  // combat effectiveness multiplier (Phase 2)

  // --- Construction ---
  // Delivery time in turns = max(1, ceil(cost / buildPointsPerTurn)).
  // Vraygon builds slower for the same money — the cost of the deep treasury.
  buildPointsPerTurn: 12,
  buildSpeedMult: { EAR: 1.0, VRA: 0.8, ZAN: 1.2, KRE: 1.0 },

  // --- Reinforcements (the tempo knob) ---
  // Every reinforcementIntervalTurns, each power receives the listed hulls
  // at its map-edge entry arrow. Krelath: smallest stream.
  reinforcementIntervalTurns: 6,
  reinforcementPackets: {
    EAR: { "ear-meridian": 2, "ear-vigilant": 1 },
    VRA: { "vra-aurelian": 2, "vra-corvex": 1 },
    ZAN: { "zan-vorkul": 2, "zan-skarn": 2 },
    KRE: { "kre-nightspar": 1, "kre-vekar": 1 }
  },

  // --- Unrest (Phase 5; constants exposed now — the fast-brittle vs
  //     slow-durable axis, and where live tuning will concentrate) ---
  unrestPerTurnOccupied: 2,
  unrestReductionPerGarrisonPoint: 1,
  unrestOwnerMult: { EAR: 0.6, VRA: 0.9, ZAN: 1.5, KRE: 1.0 },
  unrestRevoltThreshold: 20,
  unrestBlocGrievanceSpike: 5,

  // --- Bloodless acquisition (Phase 5) ---
  // Earth absorbs: a fleet with assault capacity sitting peacefully at an
  // independent world converts it after N turns, N scaled by disposition.
  // Vraygon purchases: same idea, paid for in points rather than time.
  absorptionBaseTurns: 8,
  absorptionDispositionScale: 0.5,
  purchaseBasePoints: 40,
  purchaseDispositionScale: 0.5,

  // --- Intelligence (Phase 3) ---
  intelDecayPerTurn: 0.1,       // reliability lost per turn of age
  nebulaIntelQuality: 0.25,     // sensor-blind regions (Palewake)

  // --- Combat context modifiers (Phase 2; behind the combat interface) ---
  starbaseDefenseBonus: 1.5,
  krelathAmbushOpeningVolleyMult: 1.5,
  escortScreenAbsorbChance: 0.35
};
