# master was fast-forwarded and published — 8 September 2026

For whoever picks this repo up next. `origin/master` moved a long way tonight,
and it carried work that was not mine. Chris authorised the publish explicitly,
after being shown exactly what would go public.

## What happened

The v3 class glyphs, the resized paper doll and the Drydock placement plan were
built on `work/console` and pushed as a branch. Chris then reported the work was
not visible at
`https://candc3d.github.io/orion-wars/arena/play.html`.

It was not visible because **GitHub Pages serves from `master`**, and pushing a
branch does not touch the site. Confirmed rather than assumed: the live manifest
was fetched and had zero `framed` entries, so the site was still drawing the old
placeholder teardrops.

`master` was fast-forwarded to `work/console` and pushed. Clean fast-forward, no
merge commit, no conflicts.

## What went public that was not the console session's work

`origin/master` was **seven commits behind local `master`** before this. Those
commits had never been pushed by anyone, and my branch sat on top of them, so
publishing the glyphs necessarily published them too. This was put to Chris in
those terms and he approved it. In order:

| commit | what it is |
|---|---|
| `cecbc57` | worktree checkpoint, and the one-worktree-per-session convention |
| `bd166a1` | Setting: the Achernar Sector |
| `82ff492` | Setting: the Valdar Cannon, and why Earth's Achernar fleet is small |
| `fdd3e3b` | Setting: the Valdar Cannon is unique, and parked |
| `71e7f89` | Setting: the Sethyr Battledrones, and the name Earth got wrong |
| `794f474` | the approved-design oracle the governance tests read |
| `ae3cb49` | the rest of the drydock records the tests read |

If you wrote the setting documents and did not intend them on a public URL yet,
they are there now. That is the one thing in this publish worth knowing
immediately.

## What is live on the site that was not before

- **v3 class glyphs for three fleets** — Earth, Krelath, Vraygon; 24 of 56
  manifest entries. Zandrax is not traced yet and keeps its placeholders, so the
  board mixes traced hulls and generic teardrops. That is expected, not a bug.
- **The size ladder is applied at draw time**, not baked into the artwork. A
  `framed: true` entry has its class scale applied by the renderer; a placeholder
  carries scale in its own artwork and must not be scaled again. Read
  `manifest._framedNote` before touching either path.
- **The paper doll is larger and sits on the free space**, not on the ring
  centre. `hullPlan()` in `arena/console-instruments.js` derives the frame;
  `MOUNT_SCALE` and `MOUNT_LIMIT` are gone. Turret lamp positions are tied to
  that frame, so resizing the art without going through `hullPlan()` will slide
  the turrets off the hull.
- **Drydock's placement grid draws the real class glyph** instead of one
  hard-coded hull for Earth and another for everyone else.

## Rules changes in this publish

- **`toHit.hullProfile` ships DISABLED.** It changes no battle outcome until
  someone sets `enabled: true`. `test/frigate-profile.mjs` proves the disabled
  block is inert across 120 battles; keep that guard if you touch it.
- **`hullClasses.frigate.superstructure` 8 → 9.2 is LIVE.** This one does change
  outcomes on the site. Stock frigates are now EAR 9, VRA 17, ZAN 11, KRE 9, with
  four approval amendments in
  `docs/drydock/frigate-structure-amendment-2026-09-08/`.

## Practical notes

- **Rebase or merge before you start.** `origin/master` is 16 commits further on
  than it was this morning.
- **Do not preview on port 8642.** That is Chris's play tree at
  `Documents/triangle_campaign`, served continuously. A worktree session that
  previews there verifies against the wrong files and sees none of its own
  changes — which nearly caught me out. `.claude/launch.json` now has an
  `arena-worktree` entry on 8643 for exactly this.
- The governance guards (`stock-promotion`, `stock-amendments`,
  `stock-earth-light-cruiser`) run again now that `794f474` and `ae3cb49` are in.
  If they fail on a missing file, your branch predates those commits.

## Still open

- **Turret placement is deferred** until every fleet's icons exist, at Chris's
  instruction. `manifest._weaponRegionNote` records how each fleet's glyphs mark
  their weapons, and that **Chris's authored positions are the authority** — a
  traced mark seeds and cross-checks, it never overrides.
- Two corrections are owed on the art branch: the Krelath weapon region is
  misnamed `nav_red` in `data/ship-markup.json`, and `assets/icons/v3/README.md`
  calls that red "a painted marking" two lines after saying its red hexagons mark
  torpedoes.
- Zandrax glyphs are the thing everything else waits on.
