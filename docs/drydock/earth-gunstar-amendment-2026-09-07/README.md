# Final supplied-stock reconciliation — 7 September 2026

Chris asked that all supplied firing-arc updates reach the engine before further testing.

Read all JSONs in the four explicitly supplied corrected-arcs folders in Downloads, taking the highest supplied design revision per faction/class. All 29 validate. Compared hull, exact mounts (including weapon pins, faces, position and orientation), turn rate, cloak and detection bonus against stockPack: 28 match; the only outstanding difference was EAR gunstar turret 1.

The latest gunstar file was found inside the Earth corrected-arcs folder, not the previously attached Downloads-root path. Its complete pack and original-file hash are preserved in approved-designs.json. Applied faces [1,2,3] instead of [1,2], published stock revision 3; no other Gunstar content changed. Appended the approval to test/fixtures/stock-approvals.js; historical approvals unchanged.

Verification: node test/stock-promotion.js passed 8 groups across all 29 defaults, live views, recordings and historical pinned content. node test/stock-earth-light-cruiser.mjs passed 6 groups, including 36 rotated firing cases. No general fast suite or rendered stock intake test run during this usage-limited closeout.

## Light-cruiser turret 2 report

Both the supplied Earth LC r3 and fresh engine construction have turret 1 [1,2,6], turret 2 [2,3,4], rear turret [4,5,6]. A read-only HTTP request to user port 8642 confirmed the served LC turret 2 [2,3,4] and Gunstar turret 1 [1,2,3]. Thus no additional LC source correction was needed.

Read-only inspection of the existing in-app Fleet Command tab showed the old legacy canvas interface and old Gunstar mounts; its document differs from the current page served at the same URL. No game controls, storage or reload were used. Existing battles retain loaded configurations; explicit pinned packs and local stock revisions also remain authoritative by design. Starting a new session from newly loaded code is necessary to test changed defaults. Do not erase user overrides to force adoption.

## Chris's new left/right coverage test

Count weapons covering each mirrored pair: 1↔3 and 6↔4, not symmetry of every individual turret. Test runner: node test/stock-arc-symmetry.mjs. It intentionally reports failure for unresolved supplied layouts and is not added to the fast suite.

27 of 29 ships meet the count requirement. Exceptions (face order 1,2,3,4,5,6):

- VRA battleship: [4,6,4,2,3,3]; face 6 has 3 weapons versus face 4's 2.
- VRA monitor: [4,5,4,3,2,2]; face 4 has 3 weapons versus face 6's 2.

These match Chris's supplied files. No mount changes inferred from the count rule: whether to add coverage on one side, remove it on the other, or revise a turret pair remains unresolved. Counts alone do not test equality of weapon type, power or physical placement.

The requested stock correction is complete. Broader gameplay recovery remains parked.
