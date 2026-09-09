# v3 class glyphs — approved, ready for integration

Approved by Chris on 2026-09-08. Earth Defence Fleet (7 classes) and Krelath
Star Navy (10). Generated from the v3 hulls, not drawn by hand.

These are staged here rather than dropped over `assets/icons/`, because the
glyphs currently in use are generic placeholders — the same teardrop for every
class at a different scale — and replacing them changes how every ship reads on
the tactical map. That swap is the integrating session's call, not this branch's.

## What is here

Two files per class, `<faction>_<hull_key>_<detail>.svg`:

- **`_console`** — for the 120px slot inside the shield ring. Carries region
  colour, structural outlines and fold lines from the model's own geometry.
- **`_map`** — for the 28px tactical token. Same silhouette and colours, no
  fold lines: they are invisible at that size and treble the file.

Both use `viewBox="0 0 100 100"`, bow up, with the faction palette baked in —
they are loaded through `<image href>`, which cannot inherit CSS colour, so
nothing here can be re-tinted from the page.

Hull keys match `rosters.*` in `data/tactical-tuning.json`, so
`ear_missile_destroyer_console.svg` is the `missile-destroyer` entry with the
hyphen swapped for an underscore.

## How the console consumes an icon today

`arena/console-instruments.js` → `schematicMarkup()` draws whatever `iconHref`
it is handed at `x=90 y=90 width=120 height=120` inside a 300 viewBox, with the
BOW marker at the top. `arena/contacts.js` resolves that href from
`assets/icons/manifest.json`, keyed `"<FACTION>/<className>"`. So integration is:
copy the chosen files into `assets/icons/`, point the manifest at them, and
decide whether the map keeps using the same file or the `_map` variant.

The manifest's per-class `size` field scales the drawn glyph. These are traced
to a consistent frame, so relative hull size is *not* baked into the artwork —
the existing `size` values still do that job.

## Known and accepted

- **Krelath Star Knight**, starboard bow launcher: the three red torpedo hexes
  measure 3.1 units across where the Swift's equivalents are 3.5–4.1, so the
  triplet may be resolving as one blob rather than three. Flagged to Chris,
  not fixed.
- **Carrier elevator hexes** are 5.3–5.5 units: legible at 120px, roughly 1.5px
  at map size, where they will not survive. Expected.
- **Krelath fighters** carry 1.2–1.5% line coverage against 3–8% for the rest.
  Those models are simply plainer; it is not a tracing fault.

## Regenerating

```
python scripts/build-fleet.py --faction EAR --skip-clean --skip-plus
python scripts/build-fleet.py --faction KRE --skip-clean --skip-plus
python scripts/glyph-sheet-png.py --faction KRE --out review/kre.png
```

Regions, emissive rulings, glyph colours and hull orientation all live in
`data/ship-markup.json`. Adding a faction is an entry there plus a roster block
in `scripts/build-fleet.py`; no code change. Contact sheets for review are in
`contact_sheets/`.
