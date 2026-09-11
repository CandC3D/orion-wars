# The pre-alpha reel — second-cut rubric, before implementation

Every line must score at least 90; no weighted average conceals a failure.
Scores are re-derived from this cut. Native captured and decoded frames will be
visually inspected; measurable checks alone cannot earn a visual score.

| Criterion | Weight | Required evidence |
|---|---:|---|
| Individual rule legality and random outcomes | 18 | Real stock builder; canonical movement, compiled arcs/range, power, magazine, missile course/timing and PD checks. Reproducible seed, no forced rolls, no destruction. |
| Three-way clarity | 8 | All factions mutually hostile, each attacks and receives fire; no cross-faction defence support. Engine's two-side limitation explicitly documented. |
| Earth continuous beam | 5 | Substantial white core and red sheath, sustained, source-supported emplacement. |
| Krelath continuous beam | 5 | Same, green. |
| Vraygon continuous beam | 5 | Same, yellow. |
| Red and yellow star missiles | 7 | Readable radiating spikes, pulsing star, glow and trail at both cameras. |
| Green fel-fire torpedo | 7 | Readable churning flame body and tongues, distinct from star or smooth sphere. |
| PD distinctness and interception | 7 | Tracer bolts only for PD; genuine successful plasma interception visibly short of hull. |
| Hit and shield effects | 5 | Local flash, plain expanding fireball, struck-face shield response; no debris. |
| Energetic isolation | 10 | Additive/unlit, no lights/shadows; byte-identical physical colour and shadow buffers. Strict projection only. |
| Planning readability | 6 | Native pixel measurements and direct visual inspection, with corrected camera unchanged. |
| Phase camera | 5 | Shared stepped playback clock; deliberate descent and lens/focus change; height and pitch floors. |
| Pace | 4 | Exactly 1.2 times first-cut overall pace: 38/1.2 seconds, 950 frames at 30 fps. One combined manoeuvre. |
| Sound and sync | 5 | Existing synthesized cues only, six distinct roles, no music; decoded audio compared with frame-aligned schedule, worst error at most one frame. |
| Video integrity and approved physical board | 3 | 1920×1080, 30 fps, playable WebM, no incomplete frames or visible encode degradation; approved models and furnishings retained. |

Scope: prototype-only files. No engine edits or game-data changes. This is an
individually validated three-way presentation, not a three-sided stepTurn run.
Where private rule helpers are needed, a read-only adapter may expose their
unchanged source bodies; its transformation and source hashes must be audited.

Offline budgets: 350,000 submitted triangles, 200 draws, 110 MiB render targets.
Beam sheath initially 5 mm wide; projectile envelope initially 28–30 mm. These
are energetic presentation dimensions, not miniature or rules dimensions.
Adjust only after native planning and resolution inspection, and report results.
Tiny rim-code/facing-marker planning failures remain outside this effects gate.
