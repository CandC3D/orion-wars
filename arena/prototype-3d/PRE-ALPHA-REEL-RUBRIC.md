# The pre-alpha reel — rubric written before implementation

Every scored line must reach 90/100; a weighted average cannot conceal a failed
line. Direct inspection of captured, native-resolution frames is mandatory. I can
see images opened through the image viewer and will identify exactly what I saw.
The final report will distinguish measured evidence from visual judgement.

| Criterion | Weight | Evidence required |
|---|---:|---|
| Rule legality, including timing | 20 | Unmodified stock construction and resolver; replayable seed/orders; movement, heading, power, magazine, range, arcs, hit and survival assertions. No early missile impact. |
| Earth red continuous beam | 6 | Sustained near-white core and red sheath, hull emplacement to target hull; planning and resolution captures. |
| Krelath green continuous beam | 6 | Same standard, green; exact confirmed dome attachment. |
| Vraygon yellow continuous beam | 6 | Same standard, yellow; source-supported weapon attachment, no invented anatomy. |
| Neutronic star missiles, both factions | 9 | Red and yellow pulsing star points, radiating spikes, soft glow and coherent trailing motion. |
| Krelath fel-fire plasma torpedo | 9 | Green churning body and moving flame tongues, visibly distinct from a smooth orb or star missile. |
| Hit explosion and struck shield face | 7 | Confirmed beam hit; bounded flash and expanding/fading fireball, actual struck face, no debris or destruction. |
| Energetic-register and information isolation | 12 | Unlit additive objects, no lights/shadows; physical colour and shadow buffers unchanged by effects; only explicit public projection and source-supported attachments enter renderer. |
| Readability at planning height | 8 | Every effect directly inspected at the corrected high camera; native pixels measured; no enlargement of the hull or camera-floor exception. |
| Phase camera move | 7 | Shared contact-playback clock; high, deep-focus planning, deliberate descent/lens change, resolution macro focus; sampled height/pitch floors throughout. |
| Video integrity and faithful updated board | 10 | Complete deterministic 1920×1080 frames at 30 fps or better, 20–40 seconds, playable file; approved clear supports/crystals, casting and codes preserved; furniture untouched. |

Known rule issue, found before building: `resolver.js` spends a round on movement
OR firing. A turn-only order also spends that round. Missile arrival is next turn.
A scope clarification is pending: three rounds of one turn (advance, turn, fire),
or firing alone in one round. Neither requires an engine change.

Existing planning-height failures of tiny rim codes and the cast facing triangle
remain reported in REVISION-11-REVIEW.md. This reel will not silently redesign
those approved components or claim their readability has improved.

Delivery is withheld if an attachment cannot be supported by the supplied model
or its source conventions. A cosmetic point on a hull is not evidence of a missile
launcher. The rule that no raw simulation state enters the renderer remains.
