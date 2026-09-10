# Tabletop projection / 1 — draft for contact-owner review

Written before the prototype effects layer, under Chris's 9 September rulings.
This is a presentation adapter over `player-contact-frame/1` and `playerShot`
events. It is not a new simulation API. No resolver, trusted recording, raw shot,
enemy object, order, PRNG, flight course or omniscient battle view enters the
renderer. The isolated demonstration supplies authored examples of that safe
stream. Integration and any new disclosures require the contact owner's review.

## What may be drawn

- Own hulls and current contacts only: public id, faction, class, q/r and facing.
  Copy fields explicitly; never spread a ship or event into the projection.
- The asset manifest selects a display model for the known faction/class. It
  cannot establish a contact's existence or reveal a hidden design/loadout.
- q/r and the six headings remain authoritative. Display positions are derived
  locally. Uniform stand height is a presentation parameter, never altitude.
- Shared hexes use a deterministic display arrangement with a printed anchor
  and a visible tether. Do not repurpose the offset for range, arcs, orders,
  picking, movement legality, collision or sensing. Transit offsets are visual
  only; full overlapping-unit integration belongs to `map`.

## Events and sockets

An endpoint exists only when the projected event includes its coordinates AND
its id belongs to the event-time projected hull set. Both known: connect display
hull sockets above the board. One known: show a neutral radial, unresolved-origin
or unresolved-destination pulse at that hull. Neither known: no geometry.

There is no bearing field in today's safe event contract. "Unresolved bearing"
therefore means **no directional claim**, not a randomly chosen direction or a
line extended to the board edge. Missing source/destination coordinates must
never be recovered from a hull's last known or current position.

Incoming missile impacts always suppress the launcher, even if a source was
accidentally supplied. A previously seen launcher is not evidence of the launch
position. Unknown shooters do not acquire a faction-coloured effect.

The safe stream has no exact firing mount id. The prototype's source-region sockets
are authored **cosmetic hull attachments**: a visible weapon housing and hull
surface, not a claim about which simulated mount fired. Weapon points come from
confirmed source face maps; impact/stand points are seated by local raycast.
If a point or face map cannot be seated, fail the
asset gate. Never use a nozzle as a weapon socket. Adding real mount selection
to projected shots is a separate contact-owner decision.

The sample uses the Sparrowhawk's schematic-confirmed larger beam dome for
the sample shot. A geometric intersection alone is not proof of a feature's
function: new weapon/engine regions also require authored semantic evidence.
The current Krelath GLB supplies its regions through `COLOR_0`. Orange, yellow
and white remain non-emissive physical paint. A separate energetic mesh copies
the exact confirmed exhaust faces; another copies the larger emitter's faces
only during its shot. The smaller dome retains its paint with no assigned
function or energetic activation. Monoceros has separately confirmed aft-outlet
and forward laser-muzzle maps, without treating its whole red region as either
function. Shard is faithfully painted from its model, with no inferred weapon or
exhaust assignment. See `SOURCE-GAP.md` for the per-hull source/paint contract.

`resolved` is not proof of a hit, damage, a shield strike or destruction.
The isolated fixture may carry `shield-flare` only as an explicitly authored
own-ship confirmation. The adapter for existing events never manufactures it
from `resolved` or from a numeric face. A future live shield-confirmation event
needs owner approval; this slice changes no shared event schema.

## Lifetime and confirmation

A lost contact is removed, without an explosion, debris, wreck, fade trajectory,
reason or new coordinates. A kill requires an explicit confirmed own-ship
destruction or future authorised confirmed-kill report. No code in this slice
animates breakage; destruction is the next review gate. The current adapter never
infers an enemy kill from contact loss, `dead-target`, `unconfirmed` or result text.

## Time, rendering and failure

The renderer accepts only frozen `tabletop-projection/1` packets, with strict
field validation. Camera, phase changes and energetic effects take active time
from `arena/contact-playback.js` through its `hold`/`onTick` hooks. No second
animation clock is permitted. Pause freezes all animation; skip settles to the
next planning frame; cancellation clears the effect and restores planning.

Every scene drawable and material explicitly declares `physical` or `energetic`.
Missing, mixed or unknown classification fails startup. Physical paint and metal are opaque, lit, non-emissive, depth-writing and shadowed.
The explicit Shard clear-insert variant is also physical: dielectric transmission,
room-lit, depth-writing, shadow-casting and non-emissive. It uses no alpha blend;
its thickness and opaque-shadow approximations are documented in SOURCE-GAP.md. Energetic materials are
unlit, additive, non-depth-writing, occluded by physical depth, and cannot add
lights or shadows. Pipeline fullscreen operations are not scene objects.

Physical planet spheres and energetic halos must be separate drawables. Nebula
veils only add: proposed maximum linear contribution 0.06 per channel, no more
than 15% of the visible board at contribution >=0.01, with 0.012 maximum
board-average contribution. Caps apply to the sum of overlapping clouds. These
are provisional measurement gates; no nebula or planet is built in this slice.

WebGL2 or asset/classification failure shows a clear diagnostic and the existing
SVG Fleet Command link. It does not silently replace a missing hull with a
different class. The SVG client itself is unchanged.

The per-hull region contract is tabletop-colour-regions/3. Every region has a
material classification and an inert energyAttachments entry. Designation stores
exact faces but activates nothing. Only confirmed semantic subsets supply the
existing resolution demo; planning draws zero energy objects. See REGION-TABLES.md.
