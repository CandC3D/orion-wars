// Shared by the editor and every engine construction path. Direct-fleet
// callers may use tiny test fleets; objective validity does not impose floors.
export function objectiveErrors(victory, fleets) {
  if (victory == null) return [];
  if (typeof victory !== "object" || Array.isArray(victory) || victory.type !== "flagship") {
    return [`Unknown or malformed victory condition “${victory?.type ?? ""}”.`];
  }
  const errors = [];
  for (const [index, side] of [[0, "A"], [1, "B"]]) {
    const name = victory.protectedClass?.[side];
    if (typeof name !== "string" || !name.trim()) {
      errors.push(`Flagship objective is missing Side ${side}'s protected class.`);
      continue;
    }
    // Count fielded hulls, including wrecks in a supplied/resumed fleet. A real
    // destroyed flagship is a valid ended objective, unlike an absent class.
    const count = (fleets?.[index] ?? []).filter(ship => ship.className === name).length;
    if (count !== 1) errors.push(`Flagship objective requires exactly one ${name} on Side ${side} (found ${count}).`);
  }
  return errors;
}
