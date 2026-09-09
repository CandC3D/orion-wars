# Field notes: r/aigamedev

Gathered 2026-09-09 by reading the subreddit's top-of-month and new listings and the
comment threads on the substantive posts. Attributions are to Reddit handles; everything
here is other people's reporting, not measured by us. Companion to
[field-notes-claudegamedev.md](field-notes-claudegamedev.md), which covered the smaller,
more technical Claude-specific community.

Chris pointed this one out alongside the ChatGPT Images 2.5 announcement. The assessment of
whether generated art earns a place in this project is separate, in
[generated-art-2026-09-09.md](generated-art-2026-09-09.md); this document is about the
community.

---

## 1. What this subreddit is

Much larger and much louder than r/ClaudeGameDev, and model-agnostic — the front page is
dominated by GPT-6 Astra results at the moment, with Claude, Codex and Fable also present.
The flair taxonomy tells you the shape of it: *Demo | Project | Workflow*, *Discussion*,
*Tools or Resource*, *Questions & Help*, *Commercial Self Promotion*.

The dominant post format is a short video of a working prototype with a day or week number
attached — "Week 5 of making my fishing game entirely with AI", "Day 5 of making a cozy
game with no dev experience". Serial progress threads do well and their authors keep
posting. Almost everything is real-time 3D or 2D action in Godot, Three.js or the browser.

**Nobody there is building what we are building.** Across the whole top-of-month there is
one turn-based strategy project (u/Odd_Revolution7522's isometric city builder, Codex) and
one browser strategy game. No hex wargames, no tactical simulation, nothing with a rules
corpus. The engineering discussion is about shaders, water, animation and asset pipelines,
not about determinism, balance measurement or governance of authored content. Read it for
art-pipeline technique; do not expect it to have anything to say about the problems that
actually occupy us.

## 2. The thing worth knowing from this visit

**u/HealthyWest6482's "I think pixel animation is solved"** (760 points, 316 comments) is
the most-discussed thread of the month, and the headline is misleading in a way that
matters to us.

It is *not* image generation. As u/_playlogic_ worked out in the comments — the OP would
not say — Aseprite has a documented Lua API, and the model is almost certainly writing a
script, running it, screenshotting the result and adjusting the script. A language model
driving an authoring tool and checking its own work by looking at it.

That is structurally the same thing as our own art pipeline: `build-fleet.py` driving
Blender against the regions in `ship-markup.json`, contact sheets rendered for review. The
transferable lesson is not "use an image model" — it is that tool-driving plus visual
verification beats generation for anything that has to be exact. Which is the same
conclusion the r/ClaudeGameDev notes reached from a different direction.

Two cautions surfaced in that thread by other people, both fair:

- u/florodude noticed the demo was not from scratch — the base sprite is from a commercial
  asset pack. Impressive results in this community are often a model editing someone
  else's work, and the post rarely says so.
- u/_playlogic_ called the approach "really limiting", on the grounds that everything has
  to go through a script the model writes blind.

## 3. Consistency across a set is the wall everyone hits

The single most useful comment I found, from u/Alternative-Dirt-917, who has generated 200+
card illustrations for a browser card game since June:

> the hard part was never "draw a good archer", it was "draw this same archer twelve times,
> same face, same gear, same light".

They then asked the question that decides whether any of this is usable: does it hold one
character through a full sheet without drifting, and **can it redo a single frame without
touching the others?** The OP did not answer.

This is worth carrying because it is exactly the property our ship art has and did not get
from a generator. Every glyph in `assets/icons/` is traced from a model to a common frame,
so a Krelath frigate and a Krelath battleship are the same ship family by construction, not
by luck. Anything we add by generation has to clear that bar or it will look like a
different game's art dropped into ours.

## 4. Generated art needs a cleanup stage, and people are building it

u/HappyOnigiriJP's Pixel Refiner (491 points, MIT licensed, runs locally in the browser,
`pixel-refiner.app`) exists because of a problem stated plainly in the post: a generated
image looks like pixel art at normal size but falls apart in a game — blurred
anti-aliased edges, an inconsistent pixel grid, too many near-identical colours, and a
background that will not key out cleanly. The tool estimates the repeated source-pixel cell
size before resampling, and where the grid estimate is uncertain it offers alternatives
rather than silently picking one.

u/RealAstropulse pointed at an open benchmark for this class of tool
(`Retro-Diffusion/pixel-bench`), which is a healthier sign than the usual tool-drop.

The general lesson generalises past pixel art: **generated raster looks fine in the preview
and fails in the product**, and the failure is always about precision — edges, grids,
palettes, alpha. Our console is SVG drawn at several zoom levels; that is the least
forgiving possible destination for a raster asset.

## 5. Disclosure is a live argument, and the community's own answer is "don't hide it"

A large part of the pixel-animation thread is about whether art drawn by a model inside
Aseprite still counts as AI-generated for storefront disclosure. The OP joked about listing
it as non-generative. The community pushed back hard, and the most-upvoted reply
(u/HandshakeOfCO) argued that the community should wear the Steam AI badge rather than hide
behind a technicality. u/Spiritual-Spend8187 put the practical version: people mind being
lied to more than they mind the tool.

Relevant to us only if we ship, but worth deciding before rather than after. Our ships are
modelled by Chris and traced by script, which is a different claim from generated art, and
the difference is only worth anything if we are precise about which is which.

## 6. What I would take, and what I would leave

**Take:**

- Tool-driving with visual verification, over generation, for anything exact. Already our
  method; this is confirmation from a second community.
- The consistency test as an acceptance criterion for any generated asset: can it be
  reproduced twelve times without drift, and can one be redone without disturbing the rest?
- Blender MCP is being used this way by others right now (u/Potential-Edge5326,
  u/Delicious-Shower8401) and we have that MCP available in-session.

**Leave:**

- The day-number progress format and the model-benchmarking noise. Half the front page is
  "look what Astra did", which is entertainment, not technique.
- Anything about real-time 3D, water, shaders or spritesheets. Wrong shape of game.
- Asset-pack economics. Several threads are about flooding itch.io with cheap generated
  packs; that is a different business from ours and its incentives are not ours.

## 7. Reproducing

Reddit is only reachable from this environment through Chrome with `old.reddit.com`; the
in-app browser pane will not load it. Listings read: `/r/aigamedev/top/?t=month` and
`/r/aigamedev/new/`. Threads read in full: `1was23m` (pixel animation) and `1vs4uie` (Pixel
Refiner).
