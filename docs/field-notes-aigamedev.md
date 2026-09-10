# Field notes: r/aigamedev

What people building games with AI have learned, and what of it applies to Distant Sectors.
Gathered 2026-09-09 by reading the year's top listing, the new firehose, and the comment
threads on the substantive posts. Attributions are to Reddit handles; everything here is
other people's reporting, not measured by us, and several of the loudest claims are
unverified by anyone including the poster.

Companion to `docs/field-notes-claudegamedev.md`, gathered two days earlier. The two
subreddits are not the same place and the difference matters before anything below is
worth reading. r/ClaudeGameDev is small, technical, and dominated by people who have shipped
something and want to explain how. r/aigamedev is an order of magnitude larger, dominated by
demo videos, and its front page turns over daily. The `/new` listing is a firehose in which
most posts have zero or one comment. **The signal-to-noise ratio is much worse and the
findings are correspondingly fewer — but the two or three that survive are sharper, because
this subreddit contains the failures as well as the successes.** r/ClaudeGameDev mostly
does not: people there post when it worked.

---

## 1. The finding that organises everything else

Two posts, three weeks apart, used almost exactly the same words in their prompt. One
produced the most impressive artefact in the subreddit. The other produced its most-mocked.

**The success.** u/victorrseloy2 left Claude Code running for 24 hours on three "gauntlet"
prompts and got a working isometric roguelite. Asked afterwards which part of the prompt
mattered most, the author pointed at the clause demanding the result be *utterly perfect,
visually beautiful, every single thing at AAA quality*.

**The failure.** u/Legitimate-Room-1905 asked for a rigged, animated cheetah in Blender that
should *look real, like a AAA video game or Hollywood blockbuster animation*, and posted the
result under the title "GPT-6 Astra is definitely NOT AGI". It is a bad cheetah.

Same incantation, opposite outcomes. The comments on the failure worked out why, and they
are the most useful thing in the subreddit:

- u/BabblingTower: you cannot quantify "AAA"; it reduces to "make it look good". The
  suggested fix was to gather reference frames of a real cheetah's stride and give the model
  something to match.
- u/mallcopsarebastards, more bluntly: you have to build a harness that lets it evaluate the
  result and iterate.
- u/CycleMother2006, on the shape of that harness: not an off-the-shelf MCP but a custom one
  — imaging optimised at keyframes, an animation composited into a single image so the model
  can judge the whole motion at once.

**The difference between the two posts is not the adjective. It is that one of them named a
specific existing artefact to be measured against, and closed the loop.** The gauntlet
format u/victorrseloy2 shared reads roughly as *build [THING] at the level of [REFERENCE]*,
with the reference being a named commercial game, instructions to use as many subagents as
needed to keep work self-contained, and an instruction to keep looping until the output is
as good as the reference. The quality bar was attached to something the agent could look at.
The cheetah prompt had a superlative and nothing to compare it to.

This is the same lesson as r/ClaudeGameDev's "verification loops are the whole game", arrived
at from the other direction, and it sharpens it: **a quality bar is only worth writing down
if something in the loop can check it.** Otherwise it is decoration on the prompt.

---

## 2. Techniques worth taking

### The deterministic trailer, which is the best technique in the subreddit

The most valuable thing here for this project has nothing to do with roguelites. When
u/victorrseloy2's agent made a trailer, it did not screen-capture. It **swapped the game's
clock for a virtual one, drove real input events through the game's own input manager, and
wrote one PNG per 1/30 s simulation step.** The footage is therefore the agent playing its
own game, deterministically: the reported cut lands on exactly 45.000 s, and re-running it
reproduces the same file byte for byte.

That is not a video-editing trick, it is the same discipline this repo already applies to
combat resolution, pointed at presentation. It also means the footage is a *test artefact* —
if the trailer changes, something in the simulation changed.

### Generated content that regenerates from a clean clone

Same project: the audio is generated through ElevenLabs, but the **prompt catalogues live in
the repository**, so a fresh clone can rebuild the whole sound set. The adaptive soundtrack
is specified rather than merely produced — five layers, 80 BPM, A minor, sixteen bars, all
layers sharing one phase so they stack without beating.

The principle generalises past audio: *the repository should contain the thing that produces
the asset, not only the asset.* This repo learned the same lesson the hard way two days ago,
when the test suite turned out to depend on untracked design records.

### The agent writing its own handoff notes

Across three sessions with no human intervention inside a session, the same agent produced
about 8,500 lines of design and architecture documentation **for itself**, to hand off
between sessions. Nobody asked for it as a deliverable; it was the mechanism by which a
context-limited agent stayed coherent across 24 hours.

r/ClaudeGameDev reached the same conclusion deliberately (u/BasedKetsu's AGENTS.md plus
per-subsystem instruction files). Here it emerged under pressure. Two independent routes to
"decisions live in the repository, not in the chat" is about as strong as this kind of
evidence gets.

### Write the prompt with one model, execute with another

u/victorrseloy2 did not write the gauntlet prompt. It came from a different model
(GPT-5.6 Sol in the poster's account), which was asked to interview the author first — about
fifteen questions — and then produce the prompt. u/skoon described the same practice as
standing procedure: use the strongest model to produce the implementation plan and decide
what can be delegated downward, then run the cheaper models against that plan.

u/skoon also supplied the honest deflation of the whole 24-hour genre: read the prompt and it
already fixes structure, resources, success criteria, visual references, architecture,
what is out of scope, the UI, the controller mapping, the game-loop order, performance
targets and per-stage "done" criteria. **The autonomy is real. The specification did the
work.**

### Reference-anchored asset work

The pixel-art thread (u/HealthyWest6482, "I think pixel animation is solved") reports models
now driving Aseprite directly rather than emitting images — the author's framing is that it
draws rather than generates. Replications in the comments were mixed: u/cxfoulke got an
acceptable but amateur 64×64 sprite only after prompt tweaking, and the original author's own
advice was to work at a *smaller* canvas than 64×64 for native creation. Treat "solved" as
enthusiasm; treat "drive the actual tool rather than generate the artefact" as the real idea,
and note it is the same shape as the Blender-MCP work already in this repo's art pipeline.

---

## 3. The verification finding: every gate was green

The single most useful post in the current `/new` listing, from u/CS_Asset_Factory, who
builds Game Boy cartridges as AI-written C on GBDK 2020 targeting real hardware.

Every gate passed. The ROM compiled, the test suite was green, the artefact hash matched the
shipped bytes. Then they photographed the running screen, and one cartridge was printing a
garbage string where a score belonged. Cause: a shared glyph table had been widened for a
*different* product, which armed an out-of-bounds read in four cartridges at once. Their
conclusion — that no compiler or unit test can see that, and a ROM change is not finished
until every artefact that photographs the ROM is regenerated and a human looks at the picture.

Three things make this worth recording rather than admiring:

1. **The suite was not wrong, it was blind.** Everything it asserted was true.
2. **The cause was a shared table widened for another consumer** — the classic failure of a
   single source of truth with several readers.
3. **The detection was a photograph.** Not a better assertion; a picture of the running
   thing.

---

## 4. The failures and the limits

**Unmeasurable quality bars produce mockery.** Section 1. The cheetah is the worked example.

**The design can be derivative without anyone noticing.** u/Heroic_Platinum pointed out that
the 24-hour roguelite's gameplay closely resembles an existing indie game, and asked the
question nobody in the thread could answer: how much did the model invent and how much did it
borrow? When the prompt says "at the level of [REFERENCE]", the reference is doing work on
the *design* as well as the quality bar, and that is a harder thing to disclose than tooling.

**Porting claims are strong and unverifiable.** u/pxp121kr reported porting Call of Duty 2 to
the browser in ten hours — reading the binary and the assembly, reconstructing movement code,
TypeScript and WebGPU, and explicitly not releasing it because it is copyrighted. The most
useful comment was u/monsterfurby's: reverse engineering and game development are different
activities, whatever the demo suggests. The most useful counter-claim was
u/SpiritedCatch1's — a rough version of a twenty-year-old game does not show that AAA
development is finished, and the more likely outcome is that the gap widens.

**Promotional posts wear technique as a costume.** One well-received "I built a skill that
does X" post drew a comment from u/Felfedezni saying there was no repository behind it and
that requests for the code were redirected to signing up on the poster's own platform. This
is common enough here to be a reading rule: *if a technique post has no repo, no prompt and
no numbers, it is an advertisement.* The subreddit's own flair system half-admits this — a
large share of posts are tagged Commercial Self Promotion.

**Cost is now discussed openly and is not small.** The 24-hour run consumed about 40% of a
Max 20x weekly allowance, and the author was candid that the experiment happened because the
quota would otherwise have reset unused. There is a live thread complaining that the newest
high-reasoning model consumes tokens far faster than its predecessor.

---

## 5. Time, honestly

Three data points from this subreddit, worth holding together, because the front page shows
only the first one:

| Effort | Result | Source |
|---|---|---|
| 24 hours, unattended | A playable, good-looking roguelite; 60k lines; derivative design; not a product | u/victorrseloy2 |
| 6 weeks, ~2 hours a day, one subsystem | Water: swell and wind, configurable, grounded in real oceanographic reading | u/stankuslee |
| 8 months, most waking hours | Slotbound: a Steam demo that reached #2 among all demos, median session ~1h50 | u/OptimaArch |

u/stankuslee spent six weeks on *water alone* for a serious Sid Meier's Pirates! successor
with a to-scale Caribbean and a historically grounded economy — the closest genre analogue to
Distant Sectors in the subreddit — and led the post by saying explicitly that it was not a
one-shot. Their summary is the best one-line statement of the subreddit's actual position:
AI does not automatically equal slop; it makes it easier and faster to produce slop.

u/OptimaArch's account of the eight months is almost entirely non-AI work: designing systems,
testing builds, fixing bugs, reworking balance, cutting ideas that were not fun, rebuilding
until things felt right. Stack, for the record: love2d, Codex for code, bought unit and icon
assets from itch, nanobanana and pixellab for the remaining pixel art. No meaningful
marketing. And one player comment worth pinning up — the only thing that read as AI-made was
a **goblin on the title screen**, which looked like every other goblin in AI art.

That is the third independent sighting of the same tell. r/ClaudeGameDev reported it about
generated *icons*; this is the same phenomenon on a character portrait. Small, flat,
front-and-centre, and generated is the combination people detect.

---

## 6. Disclosure, which this subreddit argues about and the other one does not

Worth recording because Distant Sectors will eventually have to take a position.

The argument is live and it is not the one outsiders assume. In the pixel-art thread,
u/HealthyWest6482 joked that tool-driven pixel art could be listed as non-generative because
the model literally draws it. u/HandshakeOfCO — the same handle that anchored the engine
thread in the ClaudeGameDev notes — pushed back hard, and the position is worth quoting
because it is a *stronger* line than the critics usually demand: it is still AI-generated,
the community should not hide behind technicalities, wear the Steam badge, and take the
consequences.

The same commenter also gave the most precise available definition of slop, which is not
about tooling at all: it comes from divesting your responsibilities as an author — and if a
vision can be fulfilled completely by a two-line prompt, the problem is the vision. Several
others converged independently on low-effort, mass-produced and barely curated as the
operative meaning rather than AI-assisted.

Meanwhile u/Any_Confection_7137, a Blender and 3ds Max artist weak at coding, asked whether a
game would be called slop if AI wrote *only* the mechanics. The thread's answer was
essentially no, with u/mellamofionaa naming the asymmetry: AI in art is polarising, AI in
coding is already normalised. Distant Sectors sits on the harder side of that line, since
both the code and the ship art are AI-produced under human direction.

---

## 7. What this means for Distant Sectors

**Build the deterministic capture harness. This is the actionable item.** The repo already
has every prerequisite the trailer technique needs and does not have the technique: a
deterministic engine, a seeded PRNG whose state lives in the game state, recorded battles
that replay exactly, a headless Playwright harness, and `npm run review` producing a contact
sheet. What is missing is the virtual clock and the per-step frame dump. Adding them converts
playback into a *reproducible artefact* — and given that this session spent hours proving the
suite byte-identical, a byte-identical rendering of a battle is the natural next assertion.
It also produces the trailer as a by-product rather than a project.

**Photograph the running thing, because the suite is blind by construction.** The Game Boy
story is uncomfortably close to home. This project has a single tuning file read by many
consumers, exactly the shared-table shape that broke four cartridges at once, and this
session alone produced three separate byte-identical proofs — all of which would have stayed
green through a rendering defect. The existing `npm run review` contact sheet is the right
instrument; the finding argues for it being a *gate* rather than a tool someone remembers to
run, and for regenerating every artefact that photographs the game whenever the tuning
changes.

**The AAA clause is a warning about how briefs get written here.** A brief that says "make
the console feel like a starship" has the cheetah's problem. A brief that says "match this
screenshot" or "the arcs must agree with the oracle in `approved-designs.json`" has the
roguelite's. The console recovery this week worked precisely when there was something to
measure against and failed when the instruction was an adjective — which is a fair
description of what went wrong before Chris restated the instrument direction. **When a
quality bar cannot be checked by something in the loop, the honest move is to say so in the
brief rather than write the superlative and hope.**

**Track the generator, not just the output.** The prompt catalogues in the repository idea
is the same rule this project adopted after discovering the suite depended on untracked
files. Worth extending deliberately: anything produced by a tool — ship arcs, balance
sweeps, the model exports — should have its producing input in the repo, so a clean clone
rebuilds rather than inherits.

**On disclosure, a decision is coming and the ground is not what it looks like.** The
strictest position in the subreddit comes from *within* the AI-dev community, not from its
critics, and it is: declare it plainly and do not use technicalities. Distant Sectors uses AI
for both code and art, which is the harder case. The one comfort in the reporting is that the
detected tell is consistently *small generated character art* — goblins, icons — and this
project's visible surface is instrument panels, hex geometry and hand-directed ship models,
which is a different risk profile.

**Two counterweights to the front page.** First, six weeks on water and eight months to a
Steam demo are the real numbers; twenty-four hours to a roguelite is the exception that got
upvoted, and its own author framed it as burning surplus quota. Second, the closest genre
analogue here — a serious Pirates! successor with a real economy — is being built at two
hours a day by someone who led their post by disclaiming the one-shot framing. That is the
company this project is actually in.

---

## Sources

| Post | Author | Why it matters |
|---|---|---|
| I left Claude Code running for 24h — it built a 3D roguelite and shot its own trailer | u/victorrseloy2 | The deterministic trailer; gauntlet prompts; self-written handoff docs; repo-resident audio prompts; honest cost figures |
| GPT-6 Astra is definitely NOT AGI | u/Legitimate-Room-1905 (thread) | The unmeasurable quality bar, and the comments that diagnose it; the harness argument |
| Six AI built Game Boy ROMs on one page, and the defect our green gates could not catch | u/CS_Asset_Factory | Every gate green, defect visible only in a photograph; a shared table widened for another consumer |
| I spent 6 weeks in Godot going DEEP on water | u/stankuslee | Closest genre analogue; the real time cost of one subsystem; "easier and faster to create slop" |
| I spent 8 months making my first AI assisted game (#2 Steam demo) | u/OptimaArch | Eight months of mostly non-AI work; full stack disclosed; the title-screen goblin tell |
| I think pixel animation is solved | u/HealthyWest6482 (thread) | Driving the tool rather than generating the artefact; mixed replications; the disclosure argument |
| Call of Duty 2 running in Browser. Ported in 10 hours | u/pxp121kr (thread) | Strong unverifiable porting claim; reverse engineering is not game development |
| Real-time procedural dungeon generator in three.js | u/MajidManzarpour | One of the few posts with prompt and repository attached; open-source Three.js skill pack |
| How would you feel about a game if AI was only used for coding? | u/Any_Confection_7137 (thread) | The art/code asymmetry in how disclosure is judged |
| 8-player survival Pong, built with Opus | u/Nehekhara | Top post of the year; a small mechanic executed well beats scope |
| I built a skill that turns a handful of images into one continuous scrollable world | u/Pristine_Good7326 (thread) | The reading rule: a technique post with no repo is an advertisement |
