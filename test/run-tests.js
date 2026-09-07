import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tests = [
  ["Strategic campaign", "harness.js", "--quiet"],
  ["Tactical invariants", "tactical-invariants.js"],
  ["Captain foundation and measurement controls", "captain-foundation.js"],
  ["Captain identity, hull isolation and damaged sensor corrections", "captain-followup.mjs"],
  ["Finite sensing acquisition foundation", "sensing-foundation.mjs"],
  ["Finite sensing combat integration (host-only proof)", "sensing-combat.mjs"],
  ["Explicit sector scans and information-safe AI scan cadence", "scan-orders.mjs"],
  ["Player contact boundary, event-time projection and movement ceiling", "player-contacts.mjs"],
  ["Main Fleet Command setup, restricted sessions and map labels", "fleet-command.mjs"],
  ["Explicit warp and emergency burst commands", "special-orders.mjs"],
  ["Keel-gun target obedience and whole-point shields", "target-shield-rulings.mjs"],
  ["Player-initiated spinal cycle, vent and restricted movement preview", "manual-spinal.mjs"],
  ["Per-mount fire solution against the preferred contact", "fire-solution.mjs"],
  ["Enemy shield disclosure through a sector scan", "shield-disclosure.mjs"],
  ["Authored scenario warnings and deployment boundaries", "scenario-rulings.mjs"],
  ["Unused laser overcharge metadata removal", "overcharge-cleanup.mjs"],
  ["Timed missile homing and recorded approach geometry", "missile-homing.mjs"],
  ["Command station contracts", "command-station.js"],
  ["Tactical correctness regressions", "tactical-corrections.js"],
  ["AI movement and warp endpoints", "ai-endpoints.js"],
  ["AI movement terrain power", "ai-movement-power.js"],
  ["Approved tactical geometry", "tactical-geometry.js"],
  ["Drydock construction and pinned content", "construction.js"],
  ["Drydock individual reactors and shield generators", "construction-systems.js"],
  ["Drydock arc labels and physical placement", "drydock-presentation.js"],
  ["Drydock stock authoring", "stock-authoring.js"],
  ["Chris-approved stock fleet promotion", "stock-promotion.js"],
  ["Vraygon approved stock amendments", "stock-amendments.js"],
  ["Earth light-cruiser beam arc amendment", "stock-earth-light-cruiser.mjs"],
  ["Drydock variant rename, delete and restore", "variant-library.js"],
  ["Drydock CSV interchange and numerical references", "drydock-csv.js"],
  ["Drydock weapon specifications and power relationships", "drydock-specifications.js"],
  ["Terminal replay frames", "terminal-recording.js"],
  ["Replay integrity, side identity and partial records", "replay-status.js"],
  ["Terrain rules", "terrain-check.mjs"],
  ["Arena DOM and replay smoke", "arena-smoke.js"]
];

for (const [name, file, ...args] of tests) {
  console.log(`\n== ${name} ==`);
  const result = spawnSync(process.execPath, [join(root, "test", file), ...args], {
    cwd: root, stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nAll fast regression tests passed.");
