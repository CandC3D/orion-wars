# The pre-alpha reel — second cut

[Open the video](../evidence/pre-alpha-reel-second-cut/pre-alpha-reel.webm),
or [the video with five stills](../evidence/pre-alpha-reel-second-cut/watch.html).
**1920 × 1080, 30 fps, 950 frames, 31⅔ seconds; WebM with VP8 and Opus, 13.2 MB.**
The first cut remains in its original evidence directory.

The beams now have substantial near-white cores and coloured sheaths. Star
missiles and the green flame ball are larger, PD uses short tracer bolts, and
the plasma interception is visible short of Point. Victory fires on both
opponents; Swift fires on Point; Point returns fire on Victory. The jargon
caption is removed. Round 1 combines a turn and forward movement. Total pace
is exactly 1.2 times the first cut's: 38 / 1.2 seconds. No ship is destroyed.

## Adversarial gate

The [rubric was written before implementation](../PRE-ALPHA-REEL-SECOND-CUT-RUBRIC.md).
These are fresh self-review scores, not Chris's approval. **96.06/100 weighted;
every line at least 92.** An average was not used to excuse a failed line.

I can see the captured images. I inspected native planning/resolution stills,
native decoded beam frames, and two chronological sheets covering 67 independently
decoded samples, including closely spaced camera, turn and interception frames.
This is sampled visual inspection, not a claim to have watched every video frame.
Every frame additionally passed automated clock, bounds and budget checks.

| Criterion | Weight | Score | Evidence and remaining limitation |
|---|---:|---:|---|
| Individual rule legality and random outcomes | 18 | 100 | Canonical stock builder and unchanged rule helpers; arcs, range, costs, course, PD rolls and survival recorded. This is explicitly not a three-way stepTurn run. |
| Three-way clarity | 8 | 94 | Earth's aft beam visibly connects Victory to Swift while its forward beam attacks Point; fire connects all three opposing pairs. |
| Earth continuous beam | 5 | 95 | White core, red sheath, sustained; both real mapped emplacements used. |
| Krelath continuous beam | 5 | 95 | Two solid green/white beams from the mapped domes; no bolts. |
| Vraygon continuous beam | 5 | 95 | Yellow/white beam remains distinct from its star missile. Exact crystal role remains an acknowledged attachment uncertainty. |
| Red and yellow star missiles | 7 | 94 | Visible long radiating points, pulsing centre and coloured trail; resolved at both cameras. |
| Green fel-fire torpedo | 7 | 92 | Irregular animated flame outline and trailing tongues survive planning height. The bounded sprite implementation remains less volumetric than a future production effect. |
| PD distinctness and interception | 7 | 94 | Four separated tracers illustrate each canonical PD effort; plasma disappears into a local burst short of Point while the red missile continues. |
| Hit and shield effects | 5 | 94 | Local flash/fireball and confirmed shield absorption; no debris or hull disappearance. |
| Energetic isolation | 10 | 100 | Five effect-on/off comparisons give identical physical colour and shadow hashes; zero energetic lights. |
| Planning readability | 6 | 94 | Approximately 14–15 px beam width, 49–70 px star footprints, 55–74 px plasma envelope; native images inspected. |
| Phase camera | 5 | 94 | Deliberate one-second descent/lens change; high deep-focus planning and tilted miniature focus at resolution; floors retained. |
| Pace | 4 | 94 | 950 rather than 1,140 frames; turn then advance takes 2.4 seconds in one round. The incoming-fire interval leaves time to read the interception. |
| Sound and sync | 5 | 99 | Existing six cue definitions, no music; worst decoded attack offset 7 ms, below one 33⅓ ms frame. |
| Video integrity and approved board | 3 | 98 | All 950 video payloads and frame intervals survive audio muxing identically; current approved hulls and table retained. |

No declared rubric line is unscored. The sound score covers cue reuse, signal
integrity and measured synchronization; no subjective listening or production
sound-design score is claimed. The existing **20/100 rim-code and facing-marker
planning findings remain** outside this effects gate, unchanged.

## Rules and the three-way finding

**The tactical engine is two-sided.** Its battle constructor assigns A/B, and
stepTurn resolves opponents and missile defenders through those two sides.
It cannot execute this genuine three-way hostility graph. The box's 2–4-player
claim therefore needs an engine-owner decision. See [handover](HANDOVER-SECOND-CUT.md).

Following Fable's revised standard, this cut validates individual actions using
the rules' own functions. `rule-access.mjs` reads resolver.js, relocates its
imports and appends exports in memory. No rule body, engine file or game data is
changed. Source hashes, construction, previews, exact mount checks, power and
magazine changes, raw callbacks, RNG values and survivors are in
[legality.json](legality.json). The chosen action order is Swift, Victory, Point;
it does not claim a three-way initiative result.

Each ship turns one hexside, within its budget of two hexsides, then advances one
hex in round 1. `previewPublicStep` and `moveOrdered` agree, with no clamping.
Round 2 fires; round 3 holds, with no additional eligible shot. The canonical
missile course samples are reached at the displayed round boundaries. Arrival
and PD occur at turn 2 before the power reset. All ships are stock destroyers.

| Shooter | Target | Weapons fired | Range | Bearing face |
|---|---|---|---:|---:|
| Swift | Point | Both blaster beams; plasma torpedo | 9 | 2 |
| Victory | Point | Forward laser; neutronic missile | 10 | 2 |
| Victory | Swift | Aft laser | 4 | 4 |
| Point | Victory | Forward heavy blaster; neutronic missile | 10 | 2 |

Point's second heavy blaster cannot bear on either opponent: both lie in its
forward face, which that mount excludes. It is correctly held. All five fired
beams hit under **seed `pre-alpha-second-cut-1375`**. No random result is forced.

There is no cross-faction defence support. Each ship's own PD has an 18% chance:

| Incoming weapon | Defender | Canonical roll | Outcome |
|---|---|---:|---|
| Swift plasma torpedo | Point | 0.02423636 | Intercepted |
| Victory neutronic missile | Point | 0.67291830 | Hits |
| Point neutronic missile | Victory | 0.06721952 | Intercepted |

Thus exactly one of the two weapons approaching Point is intercepted. Victory
also intercepts the return missile. Final structure is **Victory 11, Swift 9,
Point 6**; none destroyed or crippled. Plasma torpedoes use the same interception
helper as other missiles, with no exemption in this situation.

The engine does not specify a projectile collision coordinate or a particular
PD battery. A cosmetic one-hex/32 mm stand-off illustrates successful interception;
tracer count is not a count of rules attacks. Point's weapon-crystal assignments
and Victory's separate PD battery remain the nearest honest attachments already
documented in [attachments.json](attachments.json). Swift's PD dome is confirmed.

## Image, camera and sound evidence

Beam sheath width is **5 mm**, previously 1.7 mm. Star sprites span **28 mm**;
the plasma sprite spans **30 mm**, plus its animated trailing tongues. Hulls,
camera poses and physical materials were not enlarged or recoloured. The local
hit-fireball envelope remains at most 19 mm. The effects never enter lighting,
shadows or reflection capture.

[Planning measurements](../evidence/pre-alpha-reel-second-cut/readability.json)
isolate each energetic object above 0.05 linear intensity. Beam footprints imply
14–15 pixels average transverse width, versus about 4.9 in the first cut. The
sampled PD tracer is about 20 × 9 pixels; shield flares remain 42–44 pixels.
Corresponding native `*-planning.png` images are beside that file. The renderer
consumes the strict [projection contract](PROJECTION.md), never raw game state.

Planning remains at height 150, pitch 72.14°, FOV 12.7°, with no blur. Resolution
uses height 26, pitch 38.04°, FOV 40°, and the existing 4-pixel tilted-focus cap.
The descent takes 2.5–3.5 seconds and the return 29–30 seconds. The height-24 and
pitch-32° floors hold throughout. `contact-playback.js` drives every rendered
frame through injected deterministic time. There is no shake or lens flare.

Sound reuses `arena/combat-audio.js` unchanged:

| Reel role | Existing cue |
|---|---|
| Beam | `beam` |
| Neutronic launch | `launch` |
| Plasma launch | `spinal` |
| PD tracer | `intercept` |
| Hit/interception burst | `impact` |
| Shield strike | `engage` |

The existing synthesizer renders a frame-aligned 48 kHz offline score. Chromium
MediaRecorder encodes **audio only**, to Opus at 192 kb/s. The supplied ffmpeg
then stream-copies VP8 and Opus into WebM; it needs no audio encoder for copying.
Nothing was downloaded or installed. This avoids a second picture encode:
[mux-audit.json](../evidence/pre-alpha-reel-second-cut/mux-audit.json) verifies
all 950 compressed frame payloads and their spacing are identical, with both
tracks beginning at timestamp zero. Decoded native frames show no added picture
degradation from the sound pass.

At all **22 distinct cue times**, a 1 ms amplitude envelope from the final decoded
Opus track was correlated with the reference cue attack over 110 ms. The worst
offset is **7 ms / 0.21 frame**, with 1 ms measurement resolution; correlations
range from 0.911 to 0.997. The reference peak is 0.117, below clipping. See
[sound-sync.json](../evidence/pre-alpha-reel-second-cut/sound-sync.json) and
[visible cue-onset frames](../evidence/pre-alpha-reel-second-cut/cue-onset-frames.json).
No offset correction or picture re-recording is needed.

## Verification and reproduction

Fast regression suite **passed (exit 0)**; prototype **29/29**, fleet **32/32**,
reel **8/8**. Browser capture has no script/shader errors. Repeated stepped PNGs
are byte-identical. All 950 frames pass camera floors, actual projected mesh
bounds, above-board endpoints and budgets. Maximum submission is **201,647
triangles / 128 draws**, with **93.1 MiB** estimated offscreen targets. Planning
effect inspection reaches 133 draws. These are offline reel measurements, not
a full-board or live-frame-rate claim.

```text
node arena/prototype-3d/reel/build-scenario.mjs
node arena/prototype-3d/reel/test.mjs
node arena/prototype-3d/reel/capture.mjs --video
node arena/prototype-3d/reel/mux-sound.mjs
node arena/prototype-3d/reel/webm-audit.mjs
node arena/prototype-3d/reel/inspect-video.mjs
```

`build-second-cut.mjs --search` reproduces the seed search. `mux-sound.mjs --reuse`
can reuse a locally recorded soundtrack after verifying its cue schedule.
The working fixture is `/arena/prototype-3d/reel/index.html`; the watch page
opens the finished file directly. Audio-only/silent intermediates and decoded
QA frames are reproducible and gitignored. Final video, stills and audits remain.

All repository changes are inside `arena/prototype-3d/`. No commit, branch,
rules/data change, asset intake, shared-runtime change or furniture change.
Destruction, planet/nebula samples and the full-board test remain outside this cut.
