// Modern events carry resolution-time geometry; old replays fall back to
// recorded round snapshots. Never give a renderer live ship references.
import { shieldFacing } from "../src/tactical/hex.js";
export { shieldFacing as shieldFace };
export { OFFSET_OF_FACE } from "./command-model.js";

export function eventShips(event, lookup) {
  const shooterBase = lookup(event.shooterId);
  const targetId = event.victimId ?? event.targetId;
  const targetBase = lookup(targetId);
  const shooterPos = event.shooterPos ?? shooterBase?.pos;
  const targetPos = event.victimPos ?? event.targetPos ?? targetBase?.pos;
  const attackFrom = event.approachPos ?? shooterPos;
  const shooter = shooterPos ? { ...shooterBase, id: event.shooterId,
    pos: { ...shooterPos }, facing: event.shooterFacing ?? shooterBase?.facing ?? 0 } : null;
  const target = targetPos ? { ...targetBase, id: targetId,
    pos: { ...targetPos }, facing: event.victimFacing ?? event.targetFacing ?? targetBase?.facing ?? 0 } : null;
  return { shooter, target,
    attackFrom: attackFrom ? {...attackFrom} : null,
    face: event.face ?? (target && attackFrom ? shieldFacing(target, attackFrom) : null),
    exactSource: !!event.shooterPos, exactTarget: !!(event.victimPos ?? event.targetPos) };
}

export function hitAttribution(event) {
  const screen = event.victimId && event.victimId !== event.targetId ? `; screened by ${event.victimId}` : "";
  const face = Number.isInteger(event.face) ? `; face ${event.face}` : "";
  return screen + face;
}
