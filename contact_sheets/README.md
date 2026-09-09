# Contact sheets

Review sheets for the generated ship art. Self-contained HTML — the SVG is
inlined, so they open from disk with no server and no missing-asset holes.

- `ear-fleet-glyphs.html` — Earth Defence Fleet, 7 classes
- `kre-fleet-glyphs.html` — Krelath Star Navy, 10 classes (8 hulls + 2 strike craft)
- `vra-fleet-glyphs.html` — Vraygon Star Realm, 7 classes

Each sheet shows every class at the sizes the game actually draws it: 120px
inside the console shield ring, 28px and 20px as a map token, and large. It also
states the faction's emissive ruling, because which regions are self-lit is
Chris's call and differs per faction — Earth's red is a running light, Krelath's
red is a painted marking.

## Regenerating

```
python scripts/build-fleet.py --faction EAR --skip-clean --skip-plus
python scripts/build-fleet.py --faction KRE --skip-clean --skip-plus
```

Drop `--skip-plus` to rebuild the 3D assets too, and `--skip-clean` to re-run the
coincident-shell cleanup from the source models.

The glyphs themselves land in `assets/blender/renders/v3/icons/`, which is
gitignored as regenerable output; only these sheets are committed. Nothing has
been installed over `assets/icons/` yet — the icons in use are still the generic
placeholders.
