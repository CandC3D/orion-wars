# v3 class glyphs — approved, ready for integration

Generated from the v3 hulls, not drawn by hand. Approved by Chris:

| Fleet | Classes | Approved |
|---|---|---|
| Earth Defence Fleet (`ear_`) | 7 | 2026-09-08 |
| Krelath Star Navy (`kre_`) | 10 (8 hulls + 2 strike craft) | 2026-09-08 |
| &nbsp;&nbsp;&hookrightarrow; KSN *Intrallus* | 1 (campaign boss) | **awaiting review** |
| Vraygon Star Realm (`vra_`) | 7 | 2026-09-08 |

25 classes, 50 files (24 approved; the Intrallus arrived later and is
unreviewed). Staged here rather than dropped over `assets/icons/`,
because the glyphs currently in use are generic placeholders — the same teardrop
per class at a different scale — and replacing them changes how every ship reads
on the tactical map. That swap is the integrating session's call, not this
branch's.

## What is here

Two files per class, `<faction>_<hull_key>_<detail>.svg`:

- **`_console`** — for the 120px slot inside the shield ring. Carries region
  colour, structural outlines and fold lines from the model's own geometry.
- **`_map`** — for the 28px tactical token. Same silhouette and colours, no
  fold lines: they are invisible at that size and treble the file.

All use `viewBox="0 0 100 100"`, bow up, with the faction palette baked in —
they load through `<image href>`, which cannot inherit CSS colour, so nothing
here can be re-tinted from the page.

Hull keys match `rosters.*` in `data/tactical-tuning.json` with hyphens as
underscores, so `vra_missile_destroyer_console.svg` is the `missile-destroyer`
entry for VRA. The one exception is `kre_super_dreadnought_*` — the Supreme
Leader's flagship *Intrallus* is a campaign opponent, not a class anyone can
build, so it has no roster entry to match.

## How the console resolves an icon today

`arena/console-instruments.js` → `schematicMarkup()` draws whatever `iconHref`
it is handed, at `x=90 y=90 width=120 height=120` inside a 300 viewBox, with the
BOW marker at the top. `arena/contacts.js` resolves that href from
`assets/icons/manifest.json`, keyed `"<FACTION>/<className>"`. So integration is:
copy the chosen files into `assets/icons/`, repoint the manifest, and decide
whether the map keeps the same file or takes the `_map` variant.

The manifest's per-class `size` field scales the drawn glyph. These are traced
to a consistent frame, so relative hull size is **not** baked into the artwork —
the existing `size` values still do that job. That matters most for the
*Intrallus*: it is 290 units long against the Star Lord's 204 and a destroyer's
91, and none of that reaches the token unless `size` says so.

## Faction notes

**Earth** — blue hull with pale steel structure. Red, white and green are
self-lit; the gold dish is metallic like the grey; the orange cap is painted
safety orange, neither glowing nor chrome. Orientation is derived: the painted
cap sits on the command sphere and Chris's rule is that the sphere is always at
the top, so that region's position decides which end is up.

**Krelath** — green hull with brushed bronze. Orange, yellow and white are
self-lit; red is **not** — unlike Earth, where red is a running light, Krelath
red is a painted marking. Ships orient with the warp pods aft; on torpedo
classes the three red hexagons mark torpedoes, mounted forward on most classes.
Per-hull yaw corrections are recorded in the markup file.

**The Intrallus** (`kre_super_dreadnought_*`) is the Supreme Leader's flagship,
a super dreadnought-carrier waiting at the end of the campaign. Same pipeline,
no special-casing: 478k source triangles down to 57k, region gate clean, all
seven Krelath regions surviving the trace. It orients like the rest of the
fleet — warp pods aft, bronze prow forward — and the model's own red markings
agree, clustering at the prow rather than the pod end. Yaw 180, recorded in the
markup file with the others.

**Vraygon** — gold and purple. Red, purple, orange and green are self-lit; gold,
yellow and blue are brushed metal. The gold-and-purple read is intended and
confirmed: the source models are overwhelmingly gold and yellow, so the pale
lilac hull and blue metal named in the material key barely appear in the
finished glyphs. Battleship, light cruiser and monitor are yaw-corrected 180°.

## Known and accepted

- **Vraygon red** is 0.15–0.20% of the model and effectively invisible from
  directly above, so it contributes almost no ink. Expected, not a fault.
- **Krelath Star Knight**, starboard bow launcher: the three red torpedo hexes
  measure 3.1 units across where the Swift's are 3.5–4.1, so the triplet may be
  resolving as one blob rather than three. Flagged to Chris, not fixed.
- **Krelath carrier** elevator hexes are 5.3–5.5 units: legible at 120px, about
  1.5px at map size, where they will not survive.
- **Intrallus** elevator hexes read cleanly at console size — six of them,
  hexagonal, not blobs — because the ship is half again the carrier's length.
  At 28px they go the same way the Bladestar's do.
- **Krelath fighters** carry 1.2–1.5% line coverage against 3–8% for the rest.
  Those models are simply plainer; not a tracing fault.

## Regenerating

```
python scripts/build-fleet.py --faction EAR --skip-clean --skip-plus
python scripts/build-fleet.py --faction KRE --skip-clean --skip-plus
python scripts/build-fleet.py --faction VRA --skip-clean --skip-plus
python scripts/glyph-sheet-png.py --faction VRA --out review/vra.png
```

Regions, emissive rulings, glyph colours and hull orientation all live in
`data/ship-markup.json`. Adding a faction — Zandrax is the one still outstanding
— is an entry there plus a roster block in `scripts/build-fleet.py`; no code
change. Contact sheets for review are in `contact_sheets/`.
