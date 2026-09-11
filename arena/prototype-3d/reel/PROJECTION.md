# The pre-alpha reel: projection contract

Written before the effects implementation. This is a fully observed, local
exhibition of stock destroyers, not a live captain-view adapter. Earth and Krelath
share the exhibition's side A; Point is side B. This asserts no campaign alliance.
All three contacts and both endpoints of every shot are explicitly known.

`build-scenario.mjs` alone imports the engine and consumes its callbacks. Its audit
file may contain construction and rule evidence. The browser loads only
`scenario.json`, validated by `projection.js`: known unit identifiers, public
display assets, three observed position/heading poses, observed weapon events,
actual hit/face/shield-absorption outcomes, observed projectile courses, and
eligible point-defence contributors. No game-state object, random state, tuning,
orders, magazines, hidden positions or future unobserved contact data is passed
to the renderer. The completed exhibition is an already-observed replay.

The validator rejects extra fields and unknown endpoints. This deliberately small
contract has no anonymous-fire representation: a live adapter must use the existing
restricted projection's anonymous event and must not feed unknown endpoints to
this renderer. It never derives a muzzle from a bearing. It never infers death from
contact loss. There are no destruction events in this reel.

Within round 3, presentation stretches observed fire into held beams and staggers
launches in resolver order. Projectile routes pass through the engine's actual
end-of-round course samples; impacts remain at the beginning of turn 2. Movement
interpolation and camera motion have no rules authority. Every visual clock value
comes from `arena/contact-playback.js` with an injected deterministic time source.

The engine resolves point defence as a pooled chance over eligible nearby ships,
without identifying a particular firing battery. Displayed defensive effort is
labelled cosmetic: it uses those eligible ships and truthful failed/successful
outcomes, and does not assert a battery selection or extra rules attack.

`attachments.json` maps prepared face indices to surface sockets. Existing energy
maps and authored schematics take precedence. Point's exact weapon roles are
unconfirmed: its actual green weapon crystals are the nearest honest attachments.
Green remains non-emitting physical clear plastic. Attachment metadata never
changes the physical region's material classification.

Physical and energetic scenes render separately. Energetic meshes use unlit
additive shaders, cannot cast/receive shadows, sample physical depth for occlusion,
and never enter reflection capture. The compositing pass cannot write back to the
physical colour or shadow targets. Both buffers are compared with effects on/off.
