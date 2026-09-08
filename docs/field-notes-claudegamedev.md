# Field notes: r/ClaudeGameDev

What other people building games with Claude have learned, and what of it applies to
Distant Sectors. Gathered 2026-09-07 by reading the subreddit's top and new listings plus
the comment threads on the substantive posts. Attributions are to Reddit handles;
everything here is other people's reporting, not measured by us.

Two sources came in from Chris directly: the week-6 fishing-game update in r/ClaudeAI
(u/RUSuper — Godot, assets by Claude/Astra, characters by Tripo 3D) and the
r/ClaudeGameDev front page.

---

## 1. Techniques that recur

### Verification loops are the whole game

The single most repeated lesson, and it comes from the most technically ambitious builders
rather than the loudest ones.

- **Render and look at every claim, at the right resolution.** u/MDawg74's rule: a
  full-body render puts about sixty pixels on a shoulder and cannot show a broken joint, so
  you inspect close-up per joint, front and three-quarter, or you ship a defect stamped
  verified. The tool that made the asset should also be the thing that checks the asset,
  with a picture, at every step.
- **A separate critic agent, scoring against reference.** u/BasedKetsu (Claude of Tanks,
  100+ vehicles, Three.js) built an agent that judged models purely on visual quality
  against source photographs and accepted only scores of 90+. One agent owns a vehicle
  family and implements it; a different agent reviews the render for proportions, clipping,
  missing surfaces; the orchestrator reruns the checks and commits only verified files.
- **Tests make agents reliable, but not for visuals.** Same source, and worth keeping the
  two halves separate: Claude Code became much more reliable once every system had concrete
  invariants and executable failure conditions — *and* for visual quality the only thing
  that worked was a render loop with visual comparison, because text-only review missed
  warped proportions and camera problems that one screenshot made obvious.
- **Headless simulation at volume for balance.** u/keaslenyt (Imperium, a space 4X, six
  months, Godot) tests AI opponents in batches of thousands of simulated years, on the
  stated grounds that a few manual games is not enough to know whether a change actually
  helped. Asked for balance advice by an ARPG dev whose bots were not smart enough to pick
  gear and skills, the answer was to let the bots make *all* the choices, brute-force it,
  and analyse the outcomes for imbalance.
- **The same idea at small scale.** u/mkhorne built an economy testbench for an idle game
  where a bot plays ten hours of game time in about one second of test runtime, with the
  suite asserting the curve neither stalls nor explodes. It caught two real design failures
  before any player saw them — chest costs that would have stalled the game after an hour,
  and a collection that filled in minutes instead of hours. Their real-time features get a
  hidden speed lever so end-to-end tests can run a twelve-hour loop in seconds.
- **A sandbox that is not the game.** u/MDawg74 proves every asset in a walkable Three.js
  room with a follow cam before it touches the real project — collision, culling, seam
  shimmer and animation drift all surface there in minutes.

### Decisions live in the repository, not in the chat

u/BasedKetsu keeps an AGENTS.md plus smaller per-subsystem instruction files (simulation,
vehicles, networking, UI, audio, effects, world generation) recording the rules agents need
across sessions, because fresh agents get spawned constantly and cannot reconstruct weeks
of chat history. Units are fixed and stated — meters, seconds, radians, a fixed 60 Hz —
authoritative logic must be deterministic, and vehicle changes have named geometry, armor,
module and release gates. A commenter noticed SKILL.md files colocated per source area
rather than one central index; the author confirmed that is deliberate, skills sitting next
to their own tests and lints.

### Strict ownership for parallel agents

Also u/BasedKetsu: parallel agents need separate files *and* isolated git worktrees, or
concurrent sessions overwrite each other and generate assets from a dirty tree.

### Give the agent write access to the real project folders

u/MDawg74 again: Claude works directly in the repo, props land filed under `assets\props`,
renders land where the build scripts expect them, sources get patched in place. No
download-unzip-drag step and no `final_v3 (2).glb` in a Downloads folder. The asset either
exists at its path or it does not, and the same agent that put it there can reopen it
tomorrow.

### Scaffolding: make Claude ask first, then automate the boring half

u/ennuira93 (GameBuddies.io — 17 browser party games, ~9,900 monthly actives, solo) keeps a
stripped-down game template, a small Node CLI and a few project skills. For a new game
Claude interrogates the design first — game loop, roles, phases, reconnect behaviour, what
belongs on the shared screen versus each player's phone — and only then scaffolds the client
and the server plugin. The CLI handles identity swap, typed socket events, platform
registration, locale stubs, and build/typecheck/lint, finishing with a **grep-zero check
that every template name has been replaced**. Idea to working multiplayer lobby in under an
hour, with the time saved going to design and playtesting.

### Wire the agent to real data, not just the code

Same source: PostHog, Search Console, the deployment tool and browser automation all
connected over MCP, so Claude can query live events, compare before and after a release,
and inspect production without anything being pasted into a prompt. Their verdict is that
this setup matters more than any individual prompt.

### Asset pipeline tricks worth stealing

From u/MDawg74's chain, all of it free or near-free:

- **The showroom-floor trick.** Do not generate one prop at a time. Ask the image model for
  a catalog page — every prop the set needs, spaced apart on a plain neutral floor, soft
  top-down light, faint contact shadows only. One bake came back with 39 usable textured
  props.
- **Multiview for hero assets.** Two to four images ordered front/left/back/right, front
  mandatory. Single-view bakes only texture the faces the tool saw; that is where grey clay
  backs come from.
- **Ask whether a step can succeed before paying for it.** The rig-check endpoint is free,
  so the script asks "is this riggable" before spending a credit on rigging. That pattern
  generalises well beyond this pipeline.
- **Fix the pose at generation time.** Prompt characters in a wide A-pose — arms about 40°
  off the body, fingers spread, feet apart — because the default at-attention pose gets
  rejected by the auto-rigger. A re-bake costs about 30 cents; hand-deforming a welded
  75k-vert mesh cost a day and was rejected anyway.
- **Rig clips bind by bone name**, so one clip library serves every character forever.

u/keaslenyt's 2D route: GPT Image-2 over Midjourney for anything that has to *become* an
asset — Midjourney better for imaginative concept work, GPT Image-2 better for precision —
with each tile generated against a separately-generated base tile and then aligned by hand
in Photoshop. The later refinement was to generate on top of the base tile and lift the
component off it.

### Generate rough, then re-architect with a different model

u/mattezell built a Portal tribute in one shot with Opus 5 via the "gauntlet loop," had
Fable 5.1 do an architectural rework for extensibility and write the agent documentation,
then handed it back to Opus to keep building. u/BasedKetsu used the same gauntlet loop for
the first build of Claude of Tanks — barely playable, tanks like stacked bricks — and
treated that as proof the idea was reachable rather than as a product.

---

## 2. The failures and the limits

### One-shot output is not a product, and people can tell

u/keaslenyt, pushed on whether Imperium looks AI-generated, gave the clearest statement of
the split: if you say "make a game" and keep what comes back, you are making one-shot slop.
The six months went into perfecting the UI, editing art by hand in Photoshop, directing the
lore, **and reducing unnecessary text walls**. The criticism is worth keeping even though it
was answered — u/retrorays' point is that AI tends to generate clutter and verbiage, that it
behaves as though humans like lots of text, and that you have to actively curb it.

### Time is still the cost

u/cumbiaowl posted that a simple browser game still took three days to polish to the point
of not being embarrassing, and the top reply was that three days *is nothing* — "writing is
about rewriting." A commenter's own arc: first game three days, second a week, third a month
and a half, and they were not sure the third was better. Definitely more. More is not
necessarily better.

### Art is where the reputational and commercial risk sits

- u/keaslenyt on their own art: consistency is still quite difficult to achieve. A commenter
  found the icons in particular read as obviously AI-generated and weird. The answer was
  budget — an artist gets hired if the first release does well.
- u/sidegigartist, a commercial dev, framed it as a business decision rather than an
  ideological one: the market is overcrowded, and self-flagging AI art — or being found out,
  or merely accused — is one more thing stacked against you in review temperature. Fine for
  a hobby project; for a commercial one the slower route is the safer one. Their constructive
  alternative is good: Claude is very strong at *shaders*, so pick an art style built on
  simple geometry and effects (Thomas Was Alone, Baba Is You, Will You Snail?) and you need
  very little art at all.
- u/ananbd, who works at a studio, uses Claude freely for engineering, tools and dev-ops and
  draws a hard line at art. u/Lopsided-Wave2479 reports texture artists, mappers and
  modellers refusing even to use tools *made with* generative AI — and separately reports
  that using Claude to build **tools** is a miracle while using it to build actual games
  feels miserable, which is a distinction nobody else in the subreddit drew as sharply.

### Specific technical failures people hit

- **Auto-rigger bind-pose mismatch.** u/bahaw1024 got shoulder deformation; u/mike402
  diagnosed it as the rigger assuming a bind pose the mesh is not actually in, so the armpit
  weights are computed against geometry that is not where the rigger thinks it is, and every
  clip retargeted afterwards inherits the smear. Fix the pose at generation time; weight
  painting afterwards is more expensive and worse.
- **Loose-parts splitting shatters generated geometry.** Image-to-3D output is unwelded, so
  Blender's separate-by-loose-parts produced 21,409 micro-shards on one measured scene. The
  working method is trimesh, per-face centroids projected on the floor plane, then
  rasterize, dilate and label to cluster — which keeps materials and UVs intact.
- **Multi-tool round trips rot silently.** Stripping an FBX to geometry, rigging it in a
  second tool and reapplying materials in a third gives scale and orientation two chances
  each to drift. Mitigation offered: retarget one sanity clip onto every third or fourth
  asset, so a break is one asset's problem instead of a catalog's.
- **Concurrent agents on a shared tree**, as above — called out explicitly as something that
  went wrong before worktrees.

### Tooling and cost limits

- **Usage caps end sessions mid-feature.** u/Kelvination's post is titled around getting
  shaders "this far before I hit my limit."
- **Tier guidance** from u/Ran4: roughly 10 hours of Fable a week at the $100 tier, maybe 25
  at $200, and at the $20 tier "you're not going to get anywhere."
- **Prefer a CLI over an MCP where one exists.** u/random_boss on Unity: use the newer
  pipeline package that runs Unity from the command line rather than the MCP.
- **There is no AI-first engine yet.** u/Eirdeth went looking for prebuilt Three.js systems
  — foliage, LOD banding — and found only projects shaped like a human editor. The consensus
  reply was Godot-plus-MCP as the least-bad option today, with the caveat that Godot also
  makes you build those systems yourself. One useful pointer: Shallot, a small all-code
  no-UI kit that Claude can simply read when the docs run out.

### Engine consensus, and the argument attached to it

Godot dominates, for a specific and technical reason: u/clerveu notes Claude can work
directly with the text scene files, and the MCP allows headless testing including
reproducing arbitrary game states. u/keaslenyt's reasoning for a solo dev is that you should
not be reimplementing image manipulation, particles and rendering when an engine has solved
them already.

The dissent is worth recording. u/trashaccount2022: you cannot use Unity without knowing
Unity, there is a reason vibe-coded games are almost exclusively browser-based, and building
in a real engine is gated behind creative decisions a browser game lets you skip. The
rebuttal from u/braincandybangbang is that browser constraints are themselves a creative
discipline — and, usefully, that Claude is bad at reviewing its own CSS.

---

## 3. Audio

Chris flagged this as an obvious gap for us — effects and music both — and it is the part
of the subreddit's practice that is least like the visual side, because the review problem
is genuinely different.

### The best technique post in the subreddit is about engine sound

u/Grobot93 (Oversteer, an arcade racer in Godot 4) is worth reading in full. The shape of it
transfers to any project that needs a family of related sounds:

- **The failure first.** Their first attempt was three loops pitch-shifted by RPM — one
  royalty-free V8 sample and two synths they made. It sounded awful, and Claude's research
  turned up the reason: serious studios record an engine at many steady RPMs, on and off
  throttle, and crossfade between them so any given recording is only ever pitched a few
  percent. That needs 20–30 clean recordings per engine. They had eight cars, no dyno and
  no budget.
- **The move.** Rather than source recordings, they forked an open-source engine *physics
  simulator* (Ange Yaghi's engine-sim, MIT) that synthesises sound from simulated pressure
  waves rather than samples, and had Claude strip it to a headless build, replace the
  realtime audio thread with a synchronous render-to-WAV path, and add scripted dyno
  commands — hold an exact RPM at full throttle, hold at closed throttle, limiter, two-step,
  start, shutdown, plus a per-cylinder diagnostic to confirm everything is firing.
- **The bank.** Per engine: idle, 15 full-throttle holds, 9 overrun holds about 6% apart,
  limiter, launch crackle, start, shutdown, **and a manifest recording the RPM of every
  file**. A script cuts them into seam-crossfaded, loudness-matched loops. A worker pool
  rendered 43 engines in about 20 minutes.
- **The playback rig.** In-engine it is an RPM × load blend grid — one crossfade along the
  on-throttle ladder, one along the off-throttle ladder, blended by load, each band
  pitch-tracking only a few percent, with per-car EQ and compression varying by revs to
  move the apparent mic position.
- **What it still cannot do**, stated plainly: no turbo or supercharger modelling, so spool
  and blower whine will have to be layered on top; and the public source is frozen at 2023
  with newer community builds binary-only.

The generalisable lessons: pitch-shifting one sample across a wide range is the naive
approach and it audibly fails; a **ladder of steady states plus crossfade** is the
professional one; a physical or procedural model beats sampling when you need a family of
related sounds and have no recording budget; and the bank needs a **manifest** describing
what each file is, or the playback rig cannot blend it.

### The generate-and-stream stack

u/PittWu0912's web ARPG is the other end of the spectrum — buy nothing, generate everything:
Suno for a full four-minute vocal track performed by an in-game bard, ElevenLabs for
discrete SFX (pick scrape, tumbler bite, pick snap, lock click, chest opening), weather
ambience loops, and NPC voice acting. The detail worth stealing for a browser game is
delivery, not generation: the long music track is **streamed on demand so it does not
inflate the initial bundle**.

### And the unglamorous option

u/AndySv, who writes royalty-free music for game devs, put 591 WAV tracks across 48 packs
into a Humble bundle — most with looping versions supplied. For a project that needs a
score more than it needs a *distinctive* score, licensed loops remain the cheapest path and
carry none of the provenance risk that generated art does.

### The review problem is not the visual one

Everything in section 1 about verification assumes a screenshot. Audio has no screenshot,
and nobody in the subreddit has solved this — which means the gate has to be built rather
than copied. The split that does exist:

- **Machine-checkable, and worth automating:** loudness matched across the bank (the dyno
  rig does this explicitly), true-peak and clipping, consistent sample rate, bit depth and
  channel count, loop-point seam continuity, silence and DC offset, and duration against
  what the cue is triggered by. A spectral summary per file catches the one asset that came
  back far brighter or duller than its family.
- **Not machine-checkable:** whether it sounds right. That needs a listening pass, and the
  practical analogue of the icon contact sheet is an **audio contact sheet** — one page that
  auditions every cue in the bank in order, grouped by family, so the whole set can be heard
  in a sitting instead of one file at a time.

---

## 4. What this means for Distant Sectors

**Already validated.** Our rule that balance claims come from the trial harness and never
from intuition is the same practice Imperium arrived at independently, for the same stated
reason. Keeping design decisions in `docs/tactical-design.md` rather than in session history
is the AGENTS.md pattern under another name. Staying browser-native on GitHub Pages gets
support from an unexpected direction: when you have a few seconds to make someone try the
thing, no-download is close to a requirement.

**The clearest gap is that we have no visual gate.** Fleet Command and the arena are verified
by unit tests and by Chris looking at them. Every ambitious project in that subreddit
independently concluded that tests do not catch visual defects and that a render-inspect-score
loop does. The currently-failing contact-map layout assertion in `test/fleet-command.mjs` is a
concrete example of the seam — label collision is exactly the class of defect a screenshot
gate catches faster and more convincingly than an assertion.

**First piece built, 2026-09-07** (Chris ruled visual review the thing to build first):
`arena/visual-review.html`, reachable from `npm run arena`, starts every bundled scenario on
the real engine in its own iframe at a chosen viewport, side by side, and runs objective
checks per panel — the engagement actually started, the console does not scroll at 1440p, no
unclipped chrome sits past the right edge, nothing threw. It reads the scenario list from the
playfield's own bundled-scenario select, so it tracks whatever `arena/scenarios/` holds. Zero
dependencies, and it drives the existing setup form rather than needing a source change. At
both 1440×900 and 1280×800 all eight scenarios currently pass. What it deliberately does not
do is judge whether the console *reads* right — that is what the pictures are for.

**Unattended capture, same day.** Chris ruled for Playwright as a devDependency (the repo's
first, Chromium only, ~115 MB), so `npm run review` now runs the same checks headless against
its own ephemeral server, captures a full-resolution PNG of every scenario, and writes
`docs/visual-review/index.html` — the contact sheet — plus `review.json`. It exits 1 on any
failure, so it can gate a commit; warnings do not fail the run. Flags: `--width --height
--seed --side --out`, and `--out docs/visual-review/before` makes before/after pairs for a
presentation change.

The checks live once, in `arena/visual-checks.js`, and are shared verbatim: the sheet includes
the file, the headless script injects it. They cannot drift apart.

**Audio: the architecture is already right; the assets are placeholders.** `arena/combat-audio.js`
is a small synthesized cue set — nine cues (ui, engage, beam, spinal, launch, impact,
intercept, victory, defeat) built from Web Audio oscillators, with no asset dependency, an
AudioContext created only after a user gesture, and a sound toggle in the console. It is
already driven off the playback shot stream in `arena/play.js`, which is exactly where sound
should hang: cues fire from the same events that drive the visual effects, so they work in
live play and replay alike, stay deterministic, and are assertable in a test. Nothing needs
rearchitecting.

The actual gap is narrower than "no audio": the cues are oscillator stand-ins rather than
designed sounds, several engine events that deserve a cue have none (Krelath warp jump,
strike-craft recovery, the just-ruled cannon vent, target lock, shield impact as distinct
from hull damage), and there is no music at all. On music, the same caution as the art: a
distinctive score is a real cost and licensed looping packs are the cheap path; the
instrument direction argues for restrained, mechanical sound rather than sci-fi swooshes.
Note also that the spinal cannon is immobile-while-charging from 20 hexes out, so it wants a
long charge tail rather than a hit — the present `spinal` cue is a 0.46s sweep.

**Worktrees for the concurrency problem.** This repo already has every symptom — several
`.tmp-*` snapshot directories, a standing rule to stage explicit paths and never
`git add -A`, and a test failing right now because of another session's in-flight work.
Isolated worktrees per agent are the reported fix.

**On art, a caution rather than an action.** The ship pipeline is already hand-directed,
which is the right side of the line these threads draw. But if Distant Sectors ever faces an
audience, note that generated *icons* were the first thing commenters flagged in other
people's projects — small, flat and generated is the most detectable combination.

**On text, an argument for the direction already taken.** A 4X drowning in generated prose is
the single most-cited complaint about AI-built strategy games. Chris's binding instrument
direction — console gauges rather than forms, no disclaimer captions — is the structural
answer to that complaint, and it was ruled before we read any of this.

---

## Sources

| Post | Author | Why it matters |
|---|---|---|
| I used Claude Code to help me build a 4X strategy game over 6 months | u/keaslenyt | Closest analogue to this project; headless balance runs; art workflow; the one-shot-slop argument |
| I Claude Coded a multiplayer Three.js browser tank game | u/BasedKetsu | Visual quality gates, critic agents, AGENTS.md discipline, worktrees; open source |
| We run this exact chain for 3-D browser games | u/MDawg74 | End-to-end asset pipeline; the render-and-look rule; A-pose and loose-parts failures |
| I run 17 browser party games solo with Claude Code | u/ennuira93 | Scaffolding CLI, grep-zero check, analytics over MCP, production checks |
| Which engines are y'all using? | u/HandshakeOfCO (thread) | Engine consensus, subscription-tier reality, the browser-games critique |
| Any other pro/commercial game devs here? | u/ananbd (thread) | Professional practice; the art/code line; studio adoption pressure |
| Claude helps, a bunch, but a good game takes much more than AI | u/cumbiaowl (thread) | Polish time; "more isn't better" |
| How do you make assets | u/OldButtIcepop (thread) | Asset consistency; commercial risk of AI art; the shader-led art style alternative |
| AI-First Game Engine? | u/Eirdeth (thread) | No AI-native engine exists yet; browser-native as a distribution argument |
| Momentum: A Portal Game | u/mattezell | Generate rough with one model, re-architect with another |
| Week 6 of making my fishing game entirely with AI (r/ClaudeAI) | u/RUSuper | Instrument-style HUD; "objectively better model" vs. better-fitting model |
| Engine audio is hard, so I turned a physics simulator into a dyno + recording rig | u/Grobot93 | The best audio post in the subreddit; pitch-shift failure, steady-state ladder, manifests, loudness matching |
| Update on my web ARPG MMO — Hunter, Rogue, a dungeon, and lockpicking | u/PittWu0912 | Suno and ElevenLabs stack; streaming long music so it stays out of the web bundle |
| My music bundle is on Humble until Sept 18 | u/AndySv | The licensed-loops option: 591 WAVs, most with looping versions |
| Claude Code built my dragon-hoard idle game | u/mkhorne | Economy testbench (10 hours of game time per second of test); subagent market research; sprite alpha-channel debugging |
