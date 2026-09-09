# Field notes: r/aigamedev

Companion to [field-notes-claudegamedev.md](field-notes-claudegamedev.md).
Gathered 2026-09-09 from the r/aigamedev month listing and the workflow-flaired
threads. Attributions are Reddit handles; everything here is other people's
reporting, not measured by us.

The two subreddits pull differently. r/ClaudeGameDev is mostly people building
with one toolchain and comparing notes on it. r/aigamedev is broader and more
asset-pipeline-heavy — image-to-3D, decimation, rigging — which makes it the
more directly useful of the two for the ship art.

---

## 1. Techniques that recur

### Story first, then assets — consistency comes from the brief, not the tool

u/Grobot93 (Oversteer, an arcade racer) had persistent consistency problems with
generated concept art and traced it to the game having no story to design
against. A light backstory — a city built on an abandoned military research
site, three generations of occupation visible at once — was enough to change the
output. Describing that to the image model produced coherent results where
listing materials had not, and once one district was described as *the same
military bones, cleaned up rather than squatted in*, everything generated for it
came back belonging to the same city as the slums.

The order mattered as much as the content: general vibe first, then **buildings
as the consistency anchor**, and only then the concepts redone against them.

u/SnooSprouts9123 (ValeFall, a browser RTS) arrived at the same place from the
other direction. Asked how the assets hang together, the answer was not the 3D
tool at all: reference artwork generated to spec with a reference image and
explicit guidelines, and only then handed to image-to-3D. Consistency lives in
the reference, not in the mesh generator.

### The decimation pipeline, described the same way twice

Both accounts of turning generated geometry into game assets agree, and agree
with what this project found independently:

1. **Weld the mesh** — u/Grobot93 is explicit that skipping this turns the next
   step into mush.
2. Cut to the triangle budget.
3. Lay out fresh texture coordinates.
4. **Bake the detail from the heavy version onto the cheap one**, so it keeps the
   look without the cost.
5. Merge flat areas back together to tidy up.

The framing is worth keeping: the final asset is *a few thousand triangles
wearing a photograph of a model a hundred times denser*. Image-to-3D output is
quoted at 1.9M triangles against a 10k budget.

### Claude scripting headless Blender, and checking its own work

u/SnooSprouts9123's pipeline has Claude write Python that runs in headless
Blender to decimate to a per-asset polygon budget, downscale and brighten
textures, and **bake custom emissive maps so the right parts glow**. The same
scripting models small props from scratch — weapons and tools sized to attach to
the characters' hand bones and work with the existing animations.

And the part that matters most: it **renders preview images of everything so it
can check, and iterate on, its own work before assets reach the game**. That is
the render-inspect gate from the other subreddit, arrived at independently by
someone who never mentions it as a principle.

### Rig-friendly generation

Generate characters in a **T-pose with empty hands**, then attach weapons
separately in Blender. Same lesson as the A-pose finding in the ClaudeGameDev
notes: fix the pose at generation time, because the auto-rigger's assumptions are
not negotiable downstream.

### Deterministic capture instead of screen recording

The most striking single technique. u/victorrseloy's 24-hour roguelite shot its
own trailer without screen capture: the agent swapped the game's clock for a
virtual one, drove real keydown and pointermove events through the actual input
manager, and wrote one PNG per 1/30s simulation step. The footage is therefore
the agent playing its own game frame by frame — the mining shot ends a vein on
camera, the build shot spends exactly 25 scrap — the cut is data-driven, lands on
45.000s exactly, and **re-running it reproduces the same file byte for byte**.

### Generated assets as recipes in the repo

Same project: audio is generated through ElevenLabs from **prompt catalogues that
live in the repository**, so a clean clone rebuilds the whole sound set. The
asset is not the artefact; the recipe is.

Also from that run: three "gauntlet" prompts about eight hours apart, no
intervention inside a session, producing 60k lines of TypeScript across 130
files — plus **8.5k lines of design and architecture documentation the agent wrote
for itself** to hand off between sessions. The handoff docs are load-bearing, not
decoration.

---

## 2. Failures and limits

### The most expensive lesson: fix it upstream, not in the pipeline

u/Grobot93's own summary, and the single most useful paragraph in either
subreddit. When a building came out wrong the instinct was to fix it downstream —
more triangles, different settings, a better bake. That was almost always wrong.

One building's detailing came out as grey mush; they measured, concluded it had
been over-simplified, and doubled the triangle budget. The detail came back and
looked exactly as bad, because it was now a sharper copy of something already
broken in the source picture. The real fix was to go back to the concept art and
ask for four chunky blocks instead of fifteen thin fins — instant, and half the
triangles of the brute-force attempt.

It took four buildings before they believed it. The rule they landed on:
**anything small, round, or finely repeated has to be painted into the texture,
never modelled as geometry** — image-to-3D cannot resolve that detail and nothing
downstream recovers it. Their first check is now the raw high-poly mesh: if the
problem is already there, no pipeline work will save it, and the picture gets
edited instead.

### Tools that fought back

- **Unreal with Claude** was "a nightmare" for u/SnooSprouts9123 on a Mac —
  frequent crashes, slow. They moved to a Three.js browser prototype and were
  surprised how far it went. Same browser-versus-engine split the other
  subreddit reports, reached for practical rather than ideological reasons.
- **Image-to-3D services do not respect poly budgets.** Meshy ignored poly-count
  limits through its API, so Blender decimation was needed regardless — the
  "game-ready" output is not.
- **Models do not survive remesh.** u/x3haloed posted a genuinely beautiful
  generated model and then the same model after remeshing, ruined, and got no
  answer. Consistent with the point above: the cheap automated cleanup is where
  generated geometry dies.
- **Cross-browser is untested by default.** ValeFall shipped a Firefox-only
  audio crash (`AudioScheduledSourceNode.stop` out of range) that a player found;
  it worked in Chrome and Brave. Worth noting for anything we serve from Pages.

### Cost, stated plainly

Meshy: roughly 30–35 credits for a full character with mesh, texture, rigging and
animations; 15–20 for a building. The pro plan covered a full RTS prototype's
worth with credits left over.

---

## 3. What bears on Distant Sectors

**The upstream lesson describes this project's own worst habit, precisely.** Over
the ship-glyph work, the same class of defect was chased downstream repeatedly:
the Monoceros nav-ball spoke, the "hand-drawn, the spec is schematic" note, and
the Krelath warp pods were all one missing capability — the tracer could only
draw an edge where two *materials* meet, so two parts of the same material had
nothing to separate them. Colour and opacity were adjusted several times before
the actual answer, a crease pass taking fold lines from the geometry, was built.
Orientation went the same way: two shape heuristics invented and both wrong on
whole classes, when the answer was data. Grobot93's rule — check whether the
problem is already in the source before touching the pipeline — would have
shortened both.

**Weld-first is confirmed from outside.** This project hit the identical failure:
v3 exports arrive as an unwelded triangle soup at exactly 3.0 vertices per
triangle, smoothing has nothing to average across, and the collapse leaves
slivers. Welding first fixed fringing and let a planar dissolve do the whole
reduction. Good to know that is the standard failure rather than a local quirk.

**"Bake emissive maps so the right parts glow" is our emissive rulings.** Same
idea, reached differently: `data/ship-markup.json` records per faction which
regions are self-lit, and every downstream script keys off it. Their version is
per-asset, ours is per-faction, and ours is the one that scales to four fleets.

**Prompt catalogues in the repo is a pattern worth copying for audio.** The ship
art already works this way — the markup file is the recipe and the glyphs are
regenerable output, which is why adding Vraygon was a data entry and no code
change. `arena/combat-audio.js` currently hard-codes nine synthesised cues; if
those ever become generated assets, the catalogue belongs in the repo beside the
markup, not the WAVs.

**Deterministic capture is the one technique to steal outright.** The tactical
engine is already deterministic with a replay log, and there is already a
headless browser driver in `scripts/visual-review.mjs`. A virtual clock plus
synthetic input, writing one frame per simulation step, would give reproducible
footage of a battle — usable for trailers, for regression comparison between
builds, and for showing a balance finding rather than describing it. It is a
small addition to machinery that exists.

**The Firefox audio crash is a live warning.** The arena is served from GitHub
Pages to whatever browser a visitor has, and nothing in the current checks
exercises anything but Chromium.

---

## Sources

| Thread | Author | Why it earned a read |
|---|---|---|
| Building a Story For Oversteer Helped Create Consistent Art & Assets | u/Grobot93 | Story as the consistency anchor; the decimation pipeline; the fix-upstream lesson |
| I built a 3D fantasy RTS in Three.js using Claude, Meshy and Blender | u/SnooSprouts9123 | Reference-art-to-spec workflow; headless Blender scripting; self-checking preview renders; costs |
| I left Claude Code running for 24h — it built a 3D roguelite and shot its own trailer | u/victorrseloy | Deterministic capture; prompt catalogues in the repo; agent-authored handoff docs |
| Tried to one-shot GTA with Fable 5.1 and Astra 6 | — | One-shot ambition against a large target |
| I spent 6 weeks in Godot going DEEP on water | — | Explicitly not a one-shot; iteration as the point |
| Engine audio is hard, so I turned a physics simulator into a dyno rig | u/Grobot93 | Already recorded in the ClaudeGameDev notes; same author, same discipline |
