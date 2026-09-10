# Faction palette contracts - revision 06

Generated from faction-palettes.json. A known colour can be absent from a hull; its absence never creates geometry. Preparation also checks the exact authored per-hull palette/counts. An unknown colour or mismatched substance fails as an export/contract fault.

## EAR

| Key | Classification | Material / finish |
|---|---|---|
| #bfc7cc | metal | primary steel / silver |
| #a7adb1 | metal | alternate steel-family alloy; darker, slightly warmer alloy tint (linear 1.04 / 1.00 / 0.94) |
| #e1ad34 | metal | sensor-dish gold |
| #009fd7 | paint | bright blue panelling |
| #0076a9 | paint | deep blue panelling |
| #61676a | paint | dark grey paint |
| #f5831f | paint | orange weapons warning |
| #e91d2d | emissive-designated | red; function depends on actual feature |
| #46b749 | emissive-designated | green; function depends on actual feature |
| #fafafa | emissive-designated | white; function depends on actual feature |

- Monoceros lacks a7adb1; do not synthesize it. Other supplied Earth hulls include it.
- Gold is confined to the sensor dish; verify spatially per prepared hull.

## KRE

| Key | Classification | Material / finish |
|---|---|---|
| #126936 | paint | dark green hull |
| #46b749 | paint | bright green hull; distinction in fiction unassigned |
| #a97b50 | metal | bronze |
| #e91d2d | paint | red weapons warning |
| #f5831f | emissive-designated | orange; function depends on actual feature |
| #ffdd1a | emissive-designated | yellow; function depends on actual feature |
| #fafafa | emissive-designated | white; function depends on actual feature |
| #c8e4bd | paint | flight deck; roughness 1, specular return 0 |

- c8e4bd occurs on carrier, Supreme Leader flagship and combined fleet.
- Both fighters lack fafafa.

## VRA

| Key | Classification | Material / finish |
|---|---|---|
| #e1ad34 | metal | gold |
| #ffdd1a | paint | yellow paint |
| #46b749 | paint / optional moulded transparent | grown-crystal components; optional supplied clear kit parts |
| #7e3f98 | emissive-designated | purple; function unassigned |
| #d3bfe5 | emissive-designated | lavender; function unassigned |
| #e91d2d | emissive-designated | red; function unassigned |
| #f5831f | paint | orange paint |
| #75cedb | paint | pale cyan painted part; not a clear crystal |

- 75cedb occurs on Cluster, Crystal, Feldspar, Bastion and combined fleet; absent on Shard, Point and Avalanche.
- 46b749 is the only region eligible for moulded clear plastic.

All metals use the same rough fine-flake finish (metalness 0.52, roughness 0.67, burnished edge roughness 0.53). Primary steel retains its cooler source tuple; the alternate alloy is lower in value and slightly warmer. No extra alloy region is invented on Monoceros.

Zandrax: green/magenta energy-designated; dark grey/lead metal. Recorded for future intake, without invented RGB keys.

Validation coverage: see LIBRARY-AUDIT.md. Only the three frigates have been visually reviewed as board pieces; the other colours have data/material-contract checks, not a claim of full visual hull review.
