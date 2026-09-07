// Read-only interpretation of recordings, including archives without side or
// terminal-frame metadata. A recorded result never substitutes for a snapshot.
const key = entry => `${entry?.turn}:${entry?.round}`;
const validSide = side => side === 'A' || side === 'B';

export function shipSide(replay, ship) {
  const initial = replay.rounds[0]?.ships.find(s => s.id === ship.id);
  for (const side of [ship.side, initial?.side, /^([AB])-/.exec(ship.id)?.[1]]) {
    if (validSide(side)) return side;
  }
  const factions = replay.meta.factions;
  if (factions.A !== factions.B) {
    if (ship.faction === factions.A) return 'A';
    if (ship.faction === factions.B) return 'B';
  }
  return null;
}

export function fleetSummary(replay, frame) {
  const out = { A: { points: 0, survivors: 0 }, B: { points: 0, survivors: 0 }, unknown: [] };
  for (const ship of frame?.ships ?? []) {
    if (ship.destroyed) continue;
    const side = shipSide(replay, ship);
    if (!side) { out.unknown.push(ship.id); continue; }
    out[side].survivors++;
    out[side].points = out[side].points !== null && Number.isFinite(ship.points) ? out[side].points + ship.points : null;
  }
  return out;
}

export function sideLabel(replay, side) {
  const { A, B } = replay.meta.factions;
  return A === B ? `${replay.meta.factions[side]} / ${side}` : replay.meta.factions[side] ?? side;
}

export function resultLabel(replay) {
  if (replay.result.reason === 'battle in progress') return 'BATTLE IN PROGRESS · RECORD ENDS HERE';
  if (validSide(replay.result.victor)) return `${sideLabel(replay, replay.result.victor)} VICTORY`;
  return replay.result.victor === null ? 'BATTLE DRAWN' : 'RESULT UNKNOWN';
}

// These checks detect demonstrable gaps, not certify an old recording complete.
// In particular, absent optional event geometry is supported, not a gap itself.
export function replayCoverage(replay) {
  const frames = new Set(replay.rounds.map(key)), last = replay.rounds.at(-1);
  const shots = (replay.shots ?? []).filter(e => !frames.has(key(e)));
  const log = replay.log.filter(e => !frames.has(key(e)));
  const reasons = [];
  if (shots.length || log.length) reasons.push(`${shots.length} shot event(s) and ${log.length} log line(s) have no matching frame.`);
  if (Number.isFinite(replay.result.turns) && last?.turn < replay.result.turns) {
    reasons.push(`Frames stop at turn ${last.turn}; the recorded result is from turn ${replay.result.turns}.`);
  }
  const totals = fleetSummary(replay, last);
  if (replay.result.reason !== 'battle in progress' && !totals.unknown.length) {
    for (const side of ['A', 'B']) {
      const mismatches = ['points', 'survivors'].filter(field => Number.isFinite(replay.result[field + side]) &&
        totals[side][field] !== null && Math.abs(replay.result[field + side] - totals[side][field]) > 1e-9);
      if (mismatches.length) reasons.push(`${sideLabel(replay, side)} final ${mismatches.join(' / ')} disagree with the last frame.`);
    }
  }
  return { incomplete: reasons.length > 0, reasons, shots, log };
}
