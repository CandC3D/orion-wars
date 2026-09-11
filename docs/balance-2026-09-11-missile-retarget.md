# Torpedo retargeting (experiment)

11 September 2026. Chris: "games like Sins already permit missile retargeting, although this is limited
by missiles eventually running out of fuel after long chases. I don't think that would necessarily apply
here, so let's first start with missile retargeting IF an enemy ship is within a given radius (experiment)."

## The rule

`tuning.missileRetarget = { enabled, radiusHexes }`, **off by default**. A torpedo whose target dies before
it lands takes the nearest living, uncloaked enemy within `radiusHexes` of the torpedo's current position
(its last homing sample); ties by id. It is checked at each round's end and again on arrival. With nothing
that close it is lost as before (`dead-target`). No fuel: a flight lasts one turn, so the radius is the
only restraint. No RNG is drawn, and with the block disabled a battle is byte-identical to one without it.

## Why

At 52 points, of every torpedo launched, 21% arrived on a target that was already dead (Zandrax 30%,
Earth 21%, Krelath 13%, Vraygon 12%). A separate 37% were intercepted - of those reaching a live target,
47% - which is roughly what Chris met: 20 of 34 of his torpedoes stopped by three clustered Earth light
cruisers at the 70% point-defence cap.

## Measured (corpus 300 pairs; torpedo outcomes over 3600 battles at 52 pts)

| Radius | Wasted on dead target | Hit | Intercepted | ZAN | VRA | EAR | KRE | Spread sum, all sizes |
|---|---|---|---|---|---|---|---|---|
| off (live) | 21% | 42% | 37% | 65.8 | 49.1 | 43.1 | 41.4 | 196 |
| 2 | 19% | 42% | 38% | 65.4 | 49.3 | 45.1 | 39.6 | 206 |
| 3 | 18% | 43% | 39% | 65.2 | 49.3 | 45.6 | 39.4 | 204 |
| 4 | 16% | 44% | 39% | 65.4 | 49.5 | 46.2 | 38.5 | 208 |
| 6 | 11% | 47% | 41% | 65.8 | 46.1 | 48.6 | 39.0 | 206 |

(The spread sum adds the best-minus-worst gap at 4, 18, 32, 52, 68 and 132 points; lower is more even.)

Small at every radius. The torpedo doctrine - Earth - gains 2 to 5 points and Krelath lose 2 to 3. Most
orphans are not near another enemy: the torpedo is usually over the dead ship's last hex, so only a close
formation offers a second target, and a close formation is also where point defence is strongest, which is
why interception rises as the waste falls.
