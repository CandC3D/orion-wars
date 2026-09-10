# Distant Sectors: The Achernar Campaign — 3D Presentation Brief

Chris's direction for the 3D phase, 9 September 2026. Binding on asset, material and camera work.

## Concept

The game is presented as a physical tabletop miniatures game that has come to life in the player's imagination. Ships, outposts, stations, and planets are painted models mounted on posts and bases, sitting on a printed sector board, on a table, in a room. Everything the player sees is either a physical object in that room or an imagined energetic effect layered over it. Nothing else exists in the scene.

This frame is not decoration. It is the reason the low-polygon hull geometry reads as a deliberate register rather than a limitation: a miniature is supposed to be simplified. The frame only holds if it is committed to completely and never partially abandoned.

## The period

The game on the table is a product of **circa 1987**, and so is the room it is being played in. This dates every physical object in the scene and settles a great many questions that would otherwise be matters of taste.

The miniatures are **white metal**, not resin. Cast in lead alloy in a spin-cast mould, with the softness and the weight that implies: detail that rounds off where the mould could not fill, visible parting lines, occasional flash left on by whoever clipped the sprue, and a surface that takes paint slightly unevenly. They are heavy for their size and they sit on their stands with authority.

The painting is period technique, done by a competent hobbyist with the materials that existed:

- A **black undercoat**, brushed or rattle-canned on, showing at the recesses where nothing covered it.
- **Block base coats** in flat enamels or early acrylics, applied opaque and unmodulated.
- **Ink washes** for panel lining, run into recesses and along breaks — glossy where they pool, because period inks did.
- **Drybrushing** for the highlight pass, chalky and slightly overdone on the raised edges.
- **Blocky edge highlights** picked out by hand where the painter had the patience.

What does *not* exist in 1987: airbrushed zenithal priming, wet blending, glazing, weathering powders, contrast or speedpaints, and anything that reads as a modern display-cabinet finish. The paint should be good hobby work of its decade, not a 2020s Golden Demon entry. Slightly chalky, slightly heavy-handed, honest.

The board is **offset-printed paper or card**: a flat hex grid in limited spot colours, visible halftone dot in the tints, registration not quite perfect, and fold creases if it shipped folded in a box. It is a printed game component, not a rendered surface.

The table furnishings are of the period too — a hardback rulebook, polyhedral dice, a box lid with painted cover art, a mug, a spiral notebook with pencilled ship records. Nothing on that table was manufactured after 1987.

This period frame is not nostalgia for its own sake. It is what makes the simplified hulls, the flat printed board and the bold imagined effects all belong to one object, and it is the strongest single defence the presentation has against reading as an underbuilt modern space game.

## The two registers

Every element in the scene belongs to exactly one of two rendering registers. Nothing belongs to both, and nothing sits between them.

**The physical register** covers hulls, bases, posts, the board and its printed sector markings, and everything visible beyond the board edge. These objects are lit by the room's lighting, use matte physically based materials, cast and receive shadow, and sit correctly in the scene's depth. They look like painted white metal.

**The energetic register** covers engine glow, weapons fire, shield flare, and any other emitted light. These are unlit and additive. They do not contribute to the scene's lighting solution, do not cast shadow onto the board, and do not illuminate nearby hulls. They are visibly not part of the room.

Implemented as a lit pass and an emissive pass, this split is both the cheapest thing to render and the thing that makes the aesthetic legible. A viewer parses the second layer as imagined without being told.

## The physical layer

Hulls are painted white metal. The paint is mostly matte, with metallic detail picked out on engines, weapon housings, and trim, so that most of the model absorbs the key light and a few small areas return a hard specular. Casting artifacts belong: faint mold seams along the model's parting line, slightly softened detail where the mold could not hold a sharp edge, occasional unclipped flash, and paint wear on exposed corners rubbed back to bright metal underneath.

**Detail is painted, not sculpted.** The standard is a competent miniatures painter of 1987 working on a spin-cast, simply shaped hull — real technique of the period, applied to a surface that stays geometrically simple. The techniques are listed under **The period** above; what matters here is what they mean for the material:

- **Ink lining** suggests plating that was never modelled.
- **Drybrushed and hand-picked edge highlights** separate the silhouette's facets so they read at arm's length.
- **Block base coats** vary panel to panel by the painter's hand, not by a gradient, so a hull is never one dead flat colour and never smoothly blended either.

The test is whether a detail could plausibly have come off a brush in 1987. Painted suggestion of panels and greebles is wanted; sculpted panel-line density and modelled greebles are not. A painter implying a hundred panels with one wash is a different act from a modeller building a hundred panels, and only the first belongs in this frame.

**The ceiling is named explicitly: nowhere near *Sins of a Solar Empire II*.** No continuous fine-scale hull detail, no photographic normal maps, no surface density that only survives because it was rendered rather than painted. Detail of that kind pushes the object toward "spacecraft rendered at scale" and away from "object someone printed and painted," which is the opposite of what the frame requires.

In pipeline terms the work lives in the material — a lined and highlighted albedo, controlled roughness so the matte body and the metallic trim separate, light-touch ambient occlusion — rather than in mesh complexity. Silhouette and material carry the polish; topology does not.

Stations and outposts follow the same rule: cast metal, mounted, painted to the same fidelity as the ships.

Planets and other stationary sector features are the exception, and are treated in the section below.

## The imagined life of stationary objects

Ships are inert until they are ordered to move. Stationary objects are not. The board's fixed features have a life of their own, running continuously, and this is where the imagined layer is most visible.

Planets are brightly colored orbs on posts, rotating slowly and continuously, in the register of the original Star Trek planet plates: saturated single dominant hues, broad soft banding, high contrast, no attempt at geography. They are painted spheres that happen to turn. Rotation is slow enough to read as ambience rather than motion.

**Ruled 9 September 2026:** a planet is a *physical* painted sphere — lit, opaque, shadowed, a real object on the table — with a *separate* energetic halo around it. An opaque painted sphere and a purely additive orb are different things and one drawable cannot be both. The sphere is the miniature; the halo is the imagining. This is the one place a single sector feature is deliberately built from one object in each register.

Nebula clouds occupy board volume with soft wispy edges, drifting and curling on a long cycle, translucent enough that ships and posts remain fully legible through them.

**Ruled 9 September 2026:** nebulae lay a coloured veil over what is behind them and cannot darken or filter it. Additive blending only adds light. The earlier wording — that they "tint" what is behind them — asked for a transmission effect that this register cannot produce, and the veil is what is wanted instead. Their brightness is **capped**, not floored: a ceiling low enough that they never compete with weapons fire, plus a stated ceiling on how much of the board they may cover and how bright that coverage may get.

Stars, gravitic phenomena, and any other fixed sector feature follow the same principle: continuous, slow, self-contained motion that never competes with the fleet action for attention.

These features sit in the energetic register — unlit, additive, contributing nothing to the room's lighting — with one exception. They are ambient rather than emitted, so they run at all times rather than only during resolution, and their brightness is **capped** low enough that they do not compete with weapons fire.

**Ruled 10 September 2026: bases are black, and carry a small printed class code on the rim.** Faction-coloured bases read as childish and were withdrawn. Faction is now carried by the model itself — each faction's metal covers a large share of its hull (Earth steel, Krelath bronze, Vraygon gold) and the faction palettes are verified consistent fleet-wide. Class is carried by the rim code, in the faction's own designation style (e.g. `KFG-01`). The base follows the FASA pattern: a bevelled skirt at the bottom, and a low hexagonal pyramid rising to the post. Posts taper slightly and read as flight stands; if the clear-plastic material passes review they become clear.

**Ruled 9 September 2026: post height is uniform.** The game is planar and always has been — `src/tactical/hex.js` is axial `q,r` with six headings and planar range, `data/tactical-tuning.json` specifies a 72×40 arena, and the `x,y,z` on a mount is model metadata, not altitude; arcs originate at the ship's hex. Volumetric movement would be a rules revision across range, arcs, shields, visibility, terrain, deployment, orders, AI, recordings and balance, not a choice of stand height. Stand attachment and height are nonetheless **parameterised** in the asset contract so the decision stays reversible without recutting bases.

Because the rules permit two ships to share a hex and have no collision or ramming, bases need an authored arrangement for stacking and transit. Any presentation offset must remain visibly attached to the hex that actually holds the ship, and model or debris collision must never acquire rules authority.

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

**Ruled 9 September 2026: the information boundary wins.** The captains layer deliberately withholds things the player has not observed — unseen geometry, the launcher position of an incoming missile, and the fact that a lost contact was destroyed rather than merely lost. Hull-to-hull fire drawn from full simulation state would leak exactly those things back to the player through the picture. So: where both endpoints are known to the player, fire is hull to hull as described. Where an endpoint is not known, the effect is **anonymous** — it arrives from or departs toward an unresolved bearing, and it does not invent a muzzle, a hull, or a shooter. The same applies to destruction: the model breaks only on a *confirmed* kill. A contact that is merely lost simply stops being drawn. What the player is allowed to know needs writing down as a projection contract before this is built, and the renderer consumes that projection, never the raw state.

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

Cockpit and hull-level cameras. Lens flare and camera shake. Skybox or starfield as the world boundary. Sculpted greebles or modelled panel-line density on hulls. Dense relief reproduced through normal maps instead of geometry, which defeats the same standard by another route. *Sins of a Solar Empire II*-tier surface detail. Modern display-cabinet painting — airbrushed zenithal, wet blending, glazes, weathering powders. Photoreal planets. Cinematic screen-filling weapons effects. Any physical object that postdates 1987. Any element that exists in neither the room nor the imagined effects layer.

## Rulings, 9 September 2026

Settled by Chris after Astra's read of the codebase. Each is written into the section it governs.

| Question | Ruling |
|---|---|
| Planar or volumetric | **Planar.** Uniform post height; stand attachment parameterised so it stays reversible. |
| Planets against the register rule | **Physical painted sphere plus a separate energetic halo.** |
| Nebulae against the register rule | **Additive veil, brightness and coverage capped.** They add light; they do not filter it. |
| Hull-to-hull fire against the information boundary | **The boundary wins.** Anonymous effects for unknown endpoints; models break only on confirmed kills. |
| Period | **Circa 1987**, for every physical object in the scene. |
| Base identification (10 Sep) | **Black bases, small printed class code on the rim.** Faction carried by the hull's metal and palette. |
| Base and post shape (10 Sep) | **Approved for all ships:** FASA base with bevelled skirt and low hexagonal pyramid top; slightly tapering **transparent** post. |
| Rim code placement (10 Sep) | **On skirt faces 2, 4 and 6 only** — forward, rear-right, rear-left in the rules' clockwise numbering from front-left. Faces 1, 3 and 5 blank. The base turns with the ship. |
| Vraygon weapons (10 Sep) | **Transparent moulded plastic approved** for the green crystal weapon components. |
| Relative size (10 Sep) | **The compressed scale ladder is approved** — frigates about 50–55 mm, battleships about 80 mm, the Intrallus 97 mm. |
| Fighters (10 Sep) | **Depicted as wings of fighters, six to a flight** on one stand, not as single craft on a capital-ship base. |
| Facing (10 Sep) | **A subtle raised triangle on the pyramid facet at arc 2**, pointing forward, cast into the black base. |
| Flagship (10 Sep) | **The Intrallus file is the flagship.** The near-identical "Boss / Game Secret" file is retired. |
| Krelath codes (10 Sep) | `KFY-02` Interceptor, `KFB-03` Bomber, `KDN-0000` Intrallus. |
| Earth blue (10 Sep) | **As the model files have it.** |
| Sparrowhawk smaller dome (10 Sep) | **A point-defence weapon.** |
| Cameras (10 Sep) | **Fix every camera to this brief** — planning high and near-orthographic with deep focus; resolution descending to tilt-shift macro with shallow focus, as a deliberate move; hard height floor. |

Open, and needed before the effects layer is built: the **projection contract** — a written statement of what the player is permitted to know, which the renderer consumes in place of raw simulation state.

**Earth class codes, supplied by Chris 10 September 2026:** `EFG-03` Monoceros frigate, `EDD-02` Victory destroyer, `EDM-01` Saturn missile destroyer, `ELC-01` Acamar light cruiser, `ECA-03` Yi Sun-sin heavy cruiser, `EBB-01` Federation battleship, `EBY-00` Yamato gunstar battlecruiser. Krelath and Vraygon codes are carried in the model filenames.

**Vraygon codes all begin with `V` (Chris, 10 September 2026):** `VFG-04` Shard, `VDD-03` Point, `VDD-05` Avalanche, `VLC-01` Feldspar, `VCA-02` Crystal, `VBB-01` Cluster, `VMN-01` Bastion. The source filenames for *Cluster* and *Point* still read `BB-01` and `DD-03`; the codes are authoritative, not the filenames.

**Facing, ruled 10 September 2026:** a subtle raised triangle on the pyramid facet at arc 2 points forward. It replaces the heading arrow that was removed with the faction colour.
