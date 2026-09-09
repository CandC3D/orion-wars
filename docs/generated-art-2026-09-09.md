# Where generated art could earn a place — 9 September 2026

Chris raised ChatGPT Images 2.5 on the grounds that it may be useful for game assets beyond
ships. This is an honest look at where it fits, grounded in what the project actually
draws rather than in what the announcement claims. Community context is in
[field-notes-aigamedev.md](field-notes-aigamedev.md).

Short version: **not the ships, not the terrain, not the console.** There is a real
opening, and it is the campaign layer and the setting.

---

## 1. What this game draws today, and where each thing comes from

| surface | how it is made | could a generator replace it? |
|---|---|---|
| Ship glyphs, 24 classes | traced from Chris's GLBs by `build-fleet.py` against the semantic regions in `ship-markup.json` | **No** — and it would lose information, see §2 |
| Ship sprites, `arena/sprites/*.png` | Blender renders, with measured `spanUnits`/`lengthUnits` per hull | No; same reason, and they carry scale metadata |
| Terrain: planets, moons, asteroid fields, nebulae | **procedural code**, `arena/contact-terrain-art.js` and `arena.js` | **No** — see §3 |
| Console instruments: shield ring, rose, power bars, arcs | generated SVG from live ship state | No; these are readouts, not pictures |
| Campaign / setting | **nothing exists** — `docs/setting.md` and the Achernar material are prose only | **Yes** — see §4 |

## 2. Ships are already solved, and better than a generator could

The glyphs are not just pictures of the ships. Their colours are semantic, which is why we
could establish that Earth marks a mount with the painted orange cap, Vraygon with green,
and Krelath with a yellow dome per beam and three red hexagons per torpedo launcher —
recorded in `manifest._weaponRegionNote`. A generated image of a warship carries none of
that. It would be a picture where we currently have a data source.

The glyphs also share a common frame, so the whole fleet is one family by construction. The
most useful thing said in the subreddit this month, from a developer who has generated 200+
card illustrations, is that consistency across a set — not quality of a single image — is
where generation fails. We would be trading a property we have for a problem other people
are still fighting.

## 3. Terrain is procedural on purpose, and that purpose is load-bearing

`arena/contact-terrain-art.js` opens by stating its own contract: pure functions of their
arguments, no DOM, no globals, no clock, **no randomness**, no imports. The same `(q, r)`
always yields the same string, so the map never shimmers, and the art can be diffed and
unit-tested without a browser. It is also scale-free — everything is expressed against the
hex pitch, so it is correct at every zoom.

A raster planet would give up all four properties: determinism, diffability, testability
and scale-independence. It would also be the least forgiving destination possible for
generated raster, which is precisely the failure the Pixel Refiner author documents —
generated images look right in a preview and fall apart in the product, at the edges, the
grid and the alpha.

If the terrain ever wants to look richer, the move is a better procedural texture, not a
picture.

## 4. Where it would actually help

The common thread: **things with no existing source, where each item stands alone, and
where nothing has to be exact.** That is the campaign layer, and it is genuinely empty.

- **Setting illustration.** There are four setting documents now — the Achernar Sector, the
  Valdar Cannon twice, the Sethyr Battledrones — and not one image. A sector plate, a
  cannon, a drone swarm. Each is a single picture that never has to match another.
- **Faction insignia and roundels.** Four powers with a palette each and no marks. These
  would want redrawing as clean vector afterwards, but a generator is a reasonable way to
  find the shape.
- **Scenario briefing art.** One plate per scenario — the Asterion Line, the Mutara-style
  nebula action — for the mission panel that currently carries prose alone.
- **Title and menu art**, if Fleet Command ever gets a front door.
- **Throwaway UI mockups**, which never ship and so carry none of the risks below.

## 5. What would have to be true before any of it ships

- **The consistency test.** Before adopting a generated asset class, produce the same
  subject twelve times and check that one can be redone without disturbing the others. That
  is the acceptance criterion the field notes take from
  u/Alternative-Dirt-917, and it is the one that decides whether a set is usable.
- **Vector, not raster, for anything the console draws.** The console is SVG at several
  zooms. A generated raster would need redrawing as vector, which makes generation a
  concepting step rather than an asset pipeline.
- **Provenance stays honest.** Images 2.5 output carries C2PA metadata and invisible
  watermarking by OpenAI's own account. Our ships are modelled by Chris and traced by
  script; generated setting art would be a different claim. The distinction is only worth
  anything if we are precise about which is which, and the subreddit's own consensus — from
  people with more to lose than us — is to disclose rather than hide behind a technicality.
- **Licensing for anything shipped**, which is a question for Chris and not for me.

## 6. Recommendation

Try it on exactly one thing: **an illustration for one setting document.** It has no
existing source, no consistency requirement, no scale requirement, and it cannot break
anything, because nothing in the game loads it. If that comes out well, faction insignia
are the next candidate and the first real test of the twelve-times rule.

Do not point it at ships, terrain, or any instrument. Those are solved, and solved in ways
that carry information a picture cannot.

One thing worth noticing about the announcement itself: the feature nearest to our needs is
not the image model. It is that the most-discussed art result in the community this month
was a language model driving Aseprite's Lua API and screenshotting its own work — the same
shape as our Blender pipeline. If we want better art, the lever is more of that, not a
generator.
