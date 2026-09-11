# The pre-alpha reel — stopped at the rules boundary

Checked against work/presentation-3d at 120ea9f. The contact-sheet and corrected
board work is present. No rendering, rules, loadouts or model files were changed
for this preflight. No commit or branch was created.

## Two conflicts requiring a ruling

1. **Advance, turn, fire cannot all happen in one round.** The resolver's ordered
   movement branch spends the round on movement, including turn-only orders,
   and skips firing (`src/tactical/resolver.js`, lines 2339–2352). There are three
   rounds per turn. Advance in round 1, turn in round 2, fire in round 3 is a
   legal alternative, but it changes the requested duration in game terms.
2. **None of the three stock frigates carries a missile launcher.** The frigate
   envelope has `missileMounts: 0` and `magazine: 0`
   (`data/tactical-tuning.json`, lines 130–137). Each faction's explicit frigate
   `mounts` list also contains only its beam. `missileMix` names the type to use
   if missile mounts exist; it does not create a mount. The stock compiler
   gives explicit `mounts` precedence over the legacy envelope.

| Stock frigate | Compiled beam | Maximum range, hexes | Missile mounts | Magazine |
|---|---|---:|---:|---:|
| Monoceros | laser-cannon | 15 | 0 | 0 |
| Sparrowhawk | blaster-beam | 14 | 0 | 0 |
| Shard | heavy-blaster | 13 | 0 | 0 |

All three compiled beam mounts bear on faces 1–6. These are the actual frigate
ranges after the class's 0.84 weapon-reach multiplier, not the unscaled weapon
catalogue ranges.

There is a separate timing constraint for any revised missile-capable roster:
missiles resolve at **next-turn impacts**, including point defence. They cannot
hit in their launch round. A one-turn clip can show launches and in-flight
ordnance; beam hits can supply its explosions and shield strikes.

## Reproduction and evidence

Run `node arena/prototype-3d/check-reel-legality.mjs` from the worktree root.
It uses the real stock builder, read-only order preview and real `stepTurn`.
No tuning override, fake mount or scripted hit is involved. The diagnostic
groups Earth and Vraygon against Krelath solely to exercise the two-side engine;
this is not proposed campaign fiction or an approved reel scenario.

Assertions pass: movement and turn-only rounds offer no eligible shot; the
third round fires three beams, launches no missiles, and makes no clamped or
refused order. All shots are inside their compiled ranges and arcs. All three
ships survive. Preview consumes no PRNG state. The generated
`evidence/pre-alpha-reel/legality-preflight.json` contains inputs, source SHA-256
hashes, forecast actions and actual shot results. The diagnostic includes two
misses; it is evidence of legality, not footage prepared for the final reel.

The bundled ffmpeg was inspected. It provides PNG and VP8 video encoders, not
H.264. WebM at 1080p/30 is available within the requested format allowance;
encoding is not a blocker.

## Gate and next decision

The rubric was written first in PRE-ALPHA-REEL-RUBRIC.md. I can see captured
images through the image viewer. **No reel frames have been rendered or visually
scored.** The requested missile effects and one-round sequence cannot pass the
legality gate with these stock ships. No video, stills or passing artwork score
is being submitted.

Please rule on a beam-only frigate reel across three rounds of one turn, or a
revised ship/loadout brief for a reel containing the missile effects. Adding
missile mounts here would cross the explicit instruction to stop if an engine
or game-content change is needed.

Before a permitted reel is built, the Shard's weapon attachment also needs a
source-based mapping: its current region map has no confirmed weapon feature.
Its green crystal components are established weapons, but this preflight has
not assigned a firing socket or inferred a missile launcher from them.
