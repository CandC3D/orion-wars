# Corrected fleets and tabletop prototype - revision 11

Three inspection sheets pass fresh direct visual review: **Earth 97.6, Krelath 97.3, Vraygon 98.2 /100**. All 25 retained entries score at least **94.6**, with every scored hull criterion above 90. These are Astra's self-review scores, not Chris's approval.

- [Earth sheet](fleet-sheets/earth.html) / [PNG](fleet-sheets/earth.png)
- [Krelath sheet](fleet-sheets/krelath.html) / [PNG](fleet-sheets/krelath.png)
- [Vraygon sheet](fleet-sheets/vraygon.html) / [PNG](fleet-sheets/vraygon.png)
- [Pre-build rubric](REVISION-11-RUBRIC.md), [full review and per-hull scores](REVISION-11-REVIEW.md)
- [Vraygon diagnosis and matched before/after](WINDOW-DIAGNOSIS.md)
- [Approved fleet scale](FLEET-SCALE.md), [measured scene scale](SCALE.md), [every material region](FLEET-REGIONS.md)

Clear tapered posts and clear green Vraygon weapons are standard. Black FASA bases carry codes on arcs 2/4/6 and a cast triangle on arc 2. Both fighter entries carry six craft on one clear formation frame. Intrallus remains; Boss is retired. Earth steel is bright again; original blue is retained. Ink lines use complete geometry-local crease support. The smaller domes on Sparrowhawk, Swift, Ballista and Raptor are mapped as inert point-defence emitters.

**The board is a withheld working study (80.4/100): planning-facing legibility fails.** The high, near-orthographic camera shows the whole board; resolution descends and changes lens over 1200 ms on the existing playback clock. At planning height the cast triangle is covered by Sparrowhawk at all six headings, and rim capitals measure only 2.38-2.58 CSS pixels. Both readability gates score 20/100. Successful inspection views do not overturn these failures.

[Planning](evidence/planning.png), [resolution](evidence/beam.png), [six-heading evidence](evidence/revision-11/facing.json), and [native fighter flights](evidence/revision-11/extra-checks.json) record the results. The header now has a clear grid margin; supplied outlines, furniture and source art are unchanged.

Current board limits are 110k submitted triangles, 128 draws, 24 MiB material textures and 96 MiB estimated offscreen targets. Measured planning is 109,281 triangles / 114 draws, 19.57 MiB textures and 58.23 MiB targets. Full-board performance remains untested.

Fast regression suite, 29 prototype checks, 32 fleet checks and the browser reviews pass. Commands and qualifications are in the full review. With the repository's existing local server, open `/arena/prototype-3d/index.html` for the working board and `/arena/prototype-3d/fleet-sheets/earth.html` for inspection. The SVG Fleet Command fallback remains linked.

Historical assessments remain in REVIEW.md, RIM-REVIEW.md, FLEET-REVIEW.md and BRAND-REVIEW.md. Their scores and unapproved variants describe their own revisions and are superseded by revision 11. `material-study.html` retains explicit historical black/painted comparisons; its live default is approved clear. Its 90 mm optical-study Crystal is not the approved 71.94 mm fleet piece.

No commit or branch. All implementation changes are inside this prototype. Campaign-map owns permanent assets, export fixes and the Sparrowhawk schematic label; map owns integration/picking; console owns controls. No destruction, planet/nebula sample or full-board test was added.
