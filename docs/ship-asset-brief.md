# Ship Visual Asset Brief — Blender Polish Pass

Archived starting brief for the original fleet-art session. That 24-hull pass
is complete; later Dreadnought and Carrier prototypes expanded the asset set.
The task was to use the Blender MCP connection to turn the game's 24 original
ship STLs into polished visual assets — surface features,
bump/normal detail, materials, textures, and emissive glows — while preserving
each hull's silhouette, which is final and approved.

## Context

Four-power tactical/strategic wargame (original setting, no licensed material).
Browser-based game; the models will eventually render in the strategic map and
watched tactical battles, so deliverables must stay real-time friendly.

Original source set: 24 files, six hulls per faction:
Frigate, Destroyer, Light Cruiser, Heavy Cruiser, Battleship, plus one unique
sixth hull per power (Earth Command Ship, Vraygon Monitor, Zandrax Corvette,
Krelath Strike Cruiser). The Command Ship is now retired, Earth fields the
Dreadnought, and Krelath also fields the Carrier. STLs are faceted low-poly with cosmetic engine pods;
treat the silhouette as canon and add detail on top rather than resculpting.

Relative scale matters: the current point ladder is Corvette 1 / FF 2 / DD 4 /
Strike Cruiser 8 / CL 10 / CA 16 / Dreadnought 16 / Carrier 16 / Monitor 20 /
BB 32 — visual mass should read accordingly (the source models already
step up in size; keep their relative proportions).

## Species and design language (drives surface treatment)

- **Earth Federation** — humans. Sphere-and-cylinder hulls; clean, disciplined.
  Surface: paneled plating, subtle greebles, crisp seams. Think polished navy.
- **Vraygon Star Realm** — silicoid life forms; the ships ARE faceted crystal.
  Surface: crystalline facets, internal refraction/subsurface hints, hexagonal
  lattice patterns. The existing hex plating on the models is deliberate —
  amplify it, don't smooth it away.
- **Zandrax Horde** — green-skinned humanoids, numerous and unsophisticated.
  Surface: rough plate armor, weld seams, mismatched panels, battle wear.
  Brutalist, mass-produced look.
- **Krelath Empire** — multi-limbed arthropods. Flat, wide, spiky hulls.
  Surface: chitinous ridges, segmented carapace texture, organic-mechanical
  blend.

## Color schemes (per Chris — canonical)

| Faction | Base | Accents | Windows / highlights | Engine glow |
|---|---|---|---|---|
| Earth | Blue | Silver | White/blue glowing | Orange-red |
| Krelath | Green | Bronze | Yellow/green glowing | Red |
| Vraygon | Gold | Blue | Orange windows / red highlights | Orange |
| Zandrax | Red | Gold | Yellow windows / purple highlights | Yellow |

Windows and highlights are emissive. Engine glows are emissive and belong on
the pod/nozzle geometry (pods are cosmetic in the rules — visually they are
the engines).

## Rulings

- **No faction symbols, insignia, or name plates on hulls.**
- Decorative details — stripes, chevrons, hull striping and the like — are
  wanted, but as **alternative styles**: produce variants (e.g. a clean version
  and a striped/chevroned version per faction, or per hull) so Chris can pick,
  rather than baking one choice in.
- Silhouettes are final. Add detail via materials, normal/bump maps, and minor
  surface geometry (panel lines, ridges, greebles) only.

## Suggested pipeline (adapt as the Blender MCP allows)

1. Inventory pass: import each STL, fix normals/manifold issues, report poly
   counts. Keep originals untouched; work in `assets/blender/` (create it) with
   one .blend per faction or per ship as convenient.
2. Establish one faction material kit first (base PBR + accent + emissive
   window strips + engine glow), apply to that faction's battleship, render a
   turntable/beauty shot for approval **before** propagating to the other five
   hulls. One faction at a time; Earth first unless told otherwise.
3. Bump/normal detail procedurally where possible (panel lines for Earth,
   facet sharpening for Vraygon, plate/weld noise for Zandrax, carapace ridges
   for Krelath) so it scales across hull sizes without hand-painting 24 UVs.
4. Exports: keep .blend sources, and export web-ready GLB (with baked or
   packed textures) per ship for the game renderer. PNG beauty renders per
   ship for review — consistent camera angle and neutral background so the
   fleet reads as a set.
5. Check in with renders at each faction boundary; do not run ahead of a
   failed check-in (established project practice).

## Session practicalities

- Verify the Blender MCP connection first; if tools are deferred, load them
  via ToolSearch in one batch before starting.
- The game repo is `C:\Users\chorr\Documents\triangle_campaign`. Design
  context: `docs/tactical-design.md` (factions, hulls), `README.md`.
- Do not modify `data/` or `src/` — this is an art task.
- If the session model is Fable, spawn any subagents explicitly as Opus.
