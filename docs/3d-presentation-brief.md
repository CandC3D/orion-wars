# Distant Sectors: The Achernar Campaign — 3D Presentation Brief

Chris's direction for the 3D phase, 9 September 2026. Binding on asset, material and camera work.

## Concept

The game is presented as a physical tabletop miniatures game that has come to life in the player's imagination. Ships, outposts, stations, and planets are painted models mounted on posts and bases, sitting on a printed sector board, on a table, in a room. Everything the player sees is either a physical object in that room or an imagined energetic effect layered over it. Nothing else exists in the scene.

This frame is not decoration. It is the reason the low-polygon hull geometry reads as a deliberate register rather than a limitation: a miniature is supposed to be simplified. The frame only holds if it is committed to completely and never partially abandoned.

## The two registers

Every element in the scene belongs to exactly one of two rendering registers. Nothing belongs to both, and nothing sits between them.

**The physical register** covers hulls, bases, posts, the board and its printed sector markings, and everything visible beyond the board edge. These objects are lit by the room's lighting, use matte physically based materials, cast and receive shadow, and sit correctly in the scene's depth. They look like painted resin.

**The energetic register** covers engine glow, weapons fire, shield flare, and any other emitted light. These are unlit and additive. They do not contribute to the scene's lighting solution, do not cast shadow onto the board, and do not illuminate nearby hulls. They are visibly not part of the room.

Implemented as a lit pass and an emissive pass, this split is both the cheapest thing to render and the thing that makes the aesthetic legible. A viewer parses the second layer as imagined without being told.

## The physical layer

Hulls are painted cast metal. The paint is mostly matte, with metallic detail picked out on engines, weapon housings, and trim, so that most of the model absorbs the key light and a few small areas return a hard specular. Casting artifacts belong: faint mold seams along the model's parting line, slightly softened detail where the mold could not hold a sharp edge, and paint wear on exposed corners rubbed back to bright metal underneath.

**Detail is painted, not sculpted.** The standard is a competent miniatures painter working on a cleanly cast, simply shaped hull — which means real technique, applied to a surface that stays geometrically simple:

- **Panel lining.** A thinned dark wash pulled into recesses and along what few breaks the cast holds, suggesting plating that was never modelled.
- **Edge highlighting.** A lighter tone along raised edges, so the silhouette's facets separate and read at arm's length.
- **Drybrushing and a zenithal pass.** A chalky pass over upper surfaces that catches whatever texture the cast has and grounds the model under the room's key light.
- **Painted value variation.** Subtle panel-to-panel shifts in the base coat, so a hull is never one dead flat colour.

The test is whether a detail could plausibly have come off a brush. Painted suggestion of panels and greebles is wanted; sculpted panel-line density and modelled greebles are not. A painter implying a hundred panels with one wash is a different act from a modeller building a hundred panels, and only the first belongs in this frame.

**The ceiling is named explicitly: nowhere near *Sins of a Solar Empire II*.** No continuous fine-scale hull detail, no photographic normal maps, no surface density that only survives because it was rendered rather than painted. Detail of that kind pushes the object toward "spacecraft rendered at scale" and away from "object someone printed and painted," which is the opposite of what the frame requires.

In pipeline terms the work lives in the material — a lined and highlighted albedo, controlled roughness so the matte body and the metallic trim separate, light-touch ambient occlusion — rather than in mesh complexity. Silhouette and material carry the polish; topology does not.

Stations and outposts follow the same rule: cast metal, mounted, painted to the same fidelity as the ships.

Planets and other stationary sector features are the exception, and are treated in the section below.

## The imagined life of stationary objects

Ships are inert until they are ordered to move. Stationary objects are not. The board's fixed features have a life of their own, running continuously, and this is where the imagined layer is most visible.

Planets are brightly colored orbs on posts, rotating slowly and continuously, in the register of the original Star Trek planet plates: saturated single dominant hues, broad soft banding, high contrast, no attempt at geography. They are painted spheres that happen to turn. Rotation is slow enough to read as ambience rather than motion.

Nebula clouds occupy board volume with soft wispy edges, drifting and curling on a long cycle, translucent enough that ships and posts remain fully legible through them. They tint what is behind them and never obscure it.

Stars, gravitic phenomena, and any other fixed sector feature follow the same principle: continuous, slow, self-contained motion that never competes with the fleet action for attention.

These features sit in the energetic register — unlit, additive, contributing nothing to the room's lighting — with one exception. They are ambient rather than emitted, so they run at all times rather than only during resolution, and their brightness is floored low enough that they do not compete with weapons fire.

Bases carry faction color and unit class, and are the primary at-a-glance identification for both. Posts are clear or neutral and read as flight stands. If the sector map is planar, post height is uniform; if movement is volumetric, post height encodes altitude and becomes the primary readout for vertical position. This decision is open and should be settled before base geometry is finalized.

## The board and the proscenium

The board is a finite object with a visible edge, and that edge is the boundary of the game world. There is no fade, no skybox, and no procedural starfield standing in for a horizon. Space ends because the board ends.

Beyond the board edge, the table is furnished: wood grain or a cloth surface, a rulebook, dice, a box lid, a coffee cup. This furniture is structural, not ornamental. It is what tells the eye that the board is an object rather than a world, and it is what licenses the effects layer to be as bold as it needs to be. Establish the physical frame hard enough and the viewer will forgive a great deal inside it.

## Lighting

One dominant key light with the character of a room fixture, warm, from above and slightly off-axis, with soft fill. The board receives shadow from the models and from the posts. Ambient tone is a lit interior, never a void.

## Camera

The camera is doing more work than the models. It is bound to game phase, with two distinct treatments.

**Planning.** High, near-orthographic, deep focus. The whole board is legible at once with no depth-of-field falloff. This is the reading and ordering view and it must never fight comprehension.

**Resolution.** The camera descends and the lens changes: shallow focus, macro character, the tilt-shift look of a small object photographed close. This is what tells the eye "miniature" more forcefully than any material does. The transition itself is the beat that marks resolution, and it should be treated as a deliberate cut or move rather than an incidental change of viewpoint.

A hard floor governs camera descent. There is a minimum orbit height below which the camera cannot go, and hull-level and cockpit views do not exist. Below that floor the frame collapses and the game becomes an ordinary space simulation built from low-polygon assets.

## Weapons fire

Fire originates at the weapon emplacements on the firing model's hull and terminates on the target model's hull. It is ship to ship, not base to base. Arcs and beams pass above the board surface, in the volume the models occupy, and never intersect the board.

Weapons fire lives entirely in the energetic register: additive, unlit, casting nothing. It does not shake the camera, does not produce lens flare, and does not fill the frame. Beam duration and tracer speed should be tuned so that a full exchange reads clearly at the planning camera's height as well as at resolution range.

## Engine glow

Continuous, subtle, additive. Present at thruster geometry, brighter under acceleration. It does not illuminate the hull it belongs to and does not spill onto the board.

## Destruction

Destruction happens in both registers at once, and the two say different things.

The energetic register produces a real explosion — the boldest effect in the game, a bright expanding flash and burst sized to the model rather than to the frame. It is additive and unlit like everything else in that layer, and it does not illuminate the board or the surrounding hulls.

The physical register, simultaneously, breaks the toy. The model comes apart along the seams it would have been cast on, fragments scatter with weight, paint chips off the break edges to bright metal, and the pieces topple from the post and land on the board. Debris persists on the board surface for a short interval before clearing.

Neither event is a stage of the other. The imagined layer says "warship destroyed"; the physical layer says "the model broke." Both are true at the same moment, and the collision between them is the clearest single statement the presentation makes. What must not happen is the physical layer deferring to the imagined one — no vaporization, no model that simply ceases to exist inside the fireball, no expanding orange sphere left behind with nothing under it.

## Performance

Bases and posts are instanced with shared materials. The emissive pass carries a fixed bloom budget and a cap on simultaneous effects, with overflow effects degraded rather than dropped mid-flight. Target is a browser build; the two-register split should be exploited as a performance structure, not only an aesthetic one.

## Non-goals

Cockpit and hull-level cameras. Lens flare and camera shake. Skybox or starfield as the world boundary. Sculpted greebles or modelled panel-line density on hulls. *Sins of a Solar Empire II*-tier surface detail. Photoreal planets. Cinematic screen-filling weapons effects. Any element that exists in neither the room nor the imagined effects layer.

## Open question

Planar or volumetric sector movement. It decides whether post height is uniform or encodes altitude, and it blocks final base and post geometry. A rules decision that an art decision is waiting on.
