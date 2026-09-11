# The pre-alpha reel: projection contract

Second cut: a fully known, local three-way presentation of stock destroyers,
not a live captain-view adapter. Every faction is hostile to both others; there
is no allied screening or point defence. All three contacts and both endpoints
of every shot are explicitly known.

`build-second-cut.mjs` imports the canonical individual rules through the offline
`rule-access.mjs` adapter. The adapter relocates imports and appends exports;
the rule bodies remain unchanged. This is NOT a three-way `stepTurn`: that engine
supports two sides only. The audit
file may contain construction and rule evidence. The browser loads only
`scenario.json`, validated by `projection.js`: known unit identifiers, public
display assets, two validated position/heading poses, selected weapon events,
actual hit/face/shield-absorption outcomes, observed projectile courses, and
eligible point-defence contributors. No game-state object, random state, tuning,
orders, magazines, hidden positions or future unobserved contact data is passed
to the renderer. This is a fixed, fully known reel projection. A live adapter
must establish knowledge separately before it can publish comparable fields.

The validator rejects extra fields and unknown endpoints. This deliberately small
contract has no anonymous-fire representation: a live adapter must use the existing
restricted projection's anonymous event and must not feed unknown endpoints to
this renderer. It never derives a muzzle from a bearing. It never infers death from
contact loss. There are no destruction events in this reel.

Round 1 turns first, then advances, as one order. Round 2 stretches fire into held
beams and staggers launches in the audited action order (Swift, Victory, Point).
Round 3 holds. Projectile routes reach the canonical round-2 and round-3 samples
at the displayed boundaries (16.4 and 20 seconds); outcomes remain in next-turn
impacts, before any power reset. Movement
interpolation and camera motion have no rules authority. Every visual clock value
comes from `arena/contact-playback.js` with an injected deterministic time source.

The engine resolves point defence as a chance over eligible friendly ships,
without identifying a particular firing battery. Each destroyer here has only
itself as a friend. Canonical seeded interception results are preserved. Tracer
bolts illustrate that effort; four tracers do not claim four rules attacks.
An intercepted projectile disappears at a cosmetic one-hex (32 mm) stand-off,
in the next-turn interception phase. That point supplies no collision rule or
extra simulation precision. Successful and failed efforts remain distinct.

`timeline.js` supplies frame-aligned effect and cue times. The existing
`combat-audio.js` synthesizer renders into an offline audio buffer at 48 kHz.
Chromium encodes only Opus audio; stream-copy muxing retains deterministic VP8
video frames. Final decoded audio is compared with the cue schedule.

`attachments.json` maps prepared face indices to surface sockets. Existing energy
maps and authored schematics take precedence. Point's exact weapon roles are
unconfirmed: its actual green weapon crystals are the nearest honest attachments.
Green remains non-emitting physical clear plastic. Attachment metadata never
changes the physical region's material classification.

Physical and energetic scenes render separately. Energetic meshes use unlit
additive shaders, cannot cast/receive shadows, sample physical depth for occlusion,
and never enter reflection capture. The compositing pass cannot write back to the
physical colour or shadow targets. Both buffers are compared with effects on/off.
