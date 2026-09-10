Playtest engine handoff — 10 September 2026

Implemented on work/playtest-engine, starting at 0abbcef. All work remains uncommitted. No merge, publication, or git metadata edit. The only arena/ edits are the two requested Asterion scenario JSON files. No additional agents or Claude calls were used.

1. **PD radius:** pointDefence.rangeHexes is 4. No other balance tuning changed. The historical stock-promotion test now asserts the exact 3 → 4 amendment before comparing everything else against its frozen snapshot.
2. **Twenty turns:** asterion-line.json and asterion-line-battleship.json now use maxTurns: 20. Both victory texts and the original Asterion briefing say turn 20. The other six bundled scenarios already inherit the tuning default of 20. **This changes the meaning of the original Asterion tutorial, balanced on 7 September around survival to turn 12. It has not been rebalanced for the extra eight turns.**
3. **Turn after movement:** optional action turnAfter: true is accepted and copied strictly. Movement uses the initial heading; the turn applies at the actual endpoint, including a shortened/blocked move, zero-forward rotation, and an immobilized charging keel. Burst translation also precedes the turn; stress is then resolved at that endpoint. Scan and warp remain exclusive and reject turnAfter. False/non-boolean values fail before execution. Both movement previews share moveOrdered. The scripted helm has no action-flag branch that needs this, so its steering is unchanged.
4. **Torpedoes:** sideView/captainObservation and every player frame now contain torpedoes, described below. Existing incoming warnings are retained unchanged. No flight creation, pursuit arithmetic, impact timing, shield-facing calculation, interception probability, or damage changed.
5. **Mount orders:** an optional mountOrders object maps each own mount ID to a current live contact ID or "hold". Unknown mounts, wrecks, unseen contacts, and other value types fail atomically. Numeric legacy IDs use JSON string keys (for example "0"); custom design string IDs work unchanged. Precedence is legal mount target, legal ship target, then existing automatic doctrine. Hold suppresses firing, including a ready keel. Orders last one turn; omitted/empty maps do not add state. Hold does not cancel automatic keel charging/maintenance or command PD/strike squadrons, which are not anti-ship mounts. Trusted previewOrders and restricted movement previews recognize held mounts.
6. **Wrecks:** engine destruction stamps wreckedTurn on own hulls and remembers an observed enemy wreck in both contact profiles. All lethal damage paths are covered: beams, spinal, missiles, strike craft, explosions, and burst stress. Live contact allowlists are unchanged; the three requested key-set tests now separately assert named and unnamed wreck shapes. Wrecks have no damage assessment, shields, or active observers and are excluded from orders, weapon geometry, movement blocking, the reference captain, and captain appraisal. Stored position/facing/name survive sensor loss and later truth-state edits. Read-only queries never create wrecks or consume RNG.
7. **Destruction tape:** a separate structured battle.destructionLog follows the existing captain-log pattern and is drained per side by player-session. Own losses always reach the tape, including the last observer and terminal impacts. Enemy losses require a contact immediately before the fatal damage. Names use vesselName.full, then an own design label or the already-known ID. The narrative log remains unsubscribed.
8. **PD attribution:** an intercepted raw missile event adds defenderIds for the pooled living, uncloaked PD hulls within range. Restricted events expose only eligible own hulls or currently known enemy hulls as defenders. No additional roll is made. The existing single pooled roll cannot identify one winning barrel, so every contributing PD hull is named; a CAP-only interception has an empty list.
9. **Balance:** the full requested node test/fleet-trial.js --battles 300 completed before tuning changes and after items 1/5. These are 300 mirrored pairs, or 600 battles per pairing. Exact counts were then reproduced in a 7,200-execution paired-radius isolation run. Mount orders are absent in this control, and the preservation comparison confirms their absence changes no combat behavior.

Observation and event shapes for the console:

```js
// observation.torpedoes[]; incoming[] remains exactly its previous shape.
{
  id: "missile:1:1", targetId: "B-ship",
  direction: "outgoing", // or "incoming"
  arrival: "before-next-refill",
  launchPos: { q: 0, r: 0 },
  pos: { q: 6, r: -0.5 }
}
// For an incoming torpedo whose launcher is not a current live contact,
// launchPos and pos are OMITTED. No launcher ID, weapon, or raw path is added.

// observation.contacts[] for a remembered wreck:
{
  id: "B-ship", faction: "KRE", className: "destroyer",
  vesselName: { prefix: "ISS", name: "Remembered", full: "ISS Remembered" },
  pos: { q: 8, r: 0 }, facing: 3,
  destroyed: true, wreckedTurn: 1
}
// vesselName is omitted for unnamed hulls. Own destroyed hulls retain their
// normal own-telemetry shape with the additive wreckedTurn field.

// A timeline entry's events[]:
{ kind: "destruction", shipId: "B-ship", name: "ISS Remembered", turn: 1, own: false }
{ kind: "missile", direction: "incoming", outcome: "intercepted",
  targetId: "A-ship", destination: { q: 0, r: 0 },
  defenders: [{ shipId: "A-escort", name: "ISS Guardian" }] }
// Missile events still NEVER contain source.

// Ship order:
{ plan: [{ turn: 1, forward: 3, turnAfter: true },
         { turn: 0, forward: 0 }, { turn: 0, forward: 0 }],
  target: "B-ship", reserve: 0.3,
  mountOrders: { "0": "B-other", "1": "hold" } }
```

Two interpretation decisions matter for integration. First, the existing timed-homing model does **not** park every torpedo at a literal midpoint: an action-1 launch toward a stationary target samples one-quarter, one-half, and three-quarters of its course before next-turn impact. I exposed those existing fractional axial positions, preserving the flight model rather than adding a second path. As explicitly requested, own outgoing projectile telemetry remains available even if the launcher dies or its target leaves contact; no separate target position or engineering is forwarded. Second, “had observed” is treated as a contact at the moment of destruction. A ship observed earlier and then lost in fog is not secretly marked dead. Once destruction was observed, its wreck is retained indefinitely. Already-destroyed host/import fixtures without an execution history are not assigned an invented death turn.

These are additive fields under the existing observation/order versions; no packet-version migration was introduced. Fable's console must branch on destroyed before reading live-only observers/observedDamage/shields, filter wrecks from all target controls, and avoid reconstructing them as destroyed:false (the old arena/spinal-panel.js does that). The old arena/contacts.js live-contact list also calls observers.map directly. Those console changes belong to the separate console worktree.

Measured percentages below are A / B / draws; the supplied published column is A / B with its original rounding preserved. The unchanged-head rerun does **not** reproduce all supplied published figures, so it is shown separately instead of attributing that discrepancy to this change.

| Pairing | Supplied published % | Unchanged head, radius 3 % | Radius 4 % | Measured PD delta A / B, pp |
| --- | --- | --- | --- | --- |
| EAR–VRA | 38 / 62 | 38.67 / 61.17 / 0.17 | 33.50 / 66.17 / 0.33 | -5.17 / +5.00 |
| EAR–ZAN | 39 / 61 | 40.00 / 59.83 / 0.17 | 26.17 / 73.50 / 0.33 | -13.83 / +13.67 |
| EAR–KRE | 46 / 54 | 42.00 / 56.83 / 1.17 | 45.83 / 53.33 / 0.83 | +3.83 / -3.50 |
| VRA–ZAN | 39 / 61 | 37.00 / 62.83 / 0.17 | 38.67 / 61.33 / 0.00 | +1.67 / -1.50 |
| VRA–KRE | 69 / 31 | 68.67 / 31.33 / 0.00 | 74.33 / 25.67 / 0.00 | +5.67 / -5.67 |
| ZAN–KRE | 73 / 28 | 71.83 / 28.17 / 0.00 | 73.67 / 26.17 / 0.17 | +1.83 / -2.00 |

Against the supplied published percentages, the new A/B deltas are EAR–VRA: -4.50 / +4.17 pp; EAR–ZAN: -12.83 / +12.50 pp; EAR–KRE: -0.17 / -0.67 pp; VRA–ZAN: -0.33 / +0.33 pp; VRA–KRE: +5.33 / -5.33 pp; ZAN–KRE: +0.67 / -1.83 pp. The supplied ZAN–KRE 73/28 totals 101 because of its reported rounding; it has not been renormalized.

| Pairing | Radius 3 wins A / B / draws | Radius 4 wins A / B / draws |
| --- | --- | --- |
| EAR–VRA | 232 / 367 / 1 | 201 / 397 / 2 |
| EAR–ZAN | 240 / 359 / 1 | 157 / 441 / 2 |
| EAR–KRE | 252 / 341 / 7 | 275 / 320 / 5 |
| VRA–ZAN | 222 / 377 / 1 | 232 / 368 / 0 |
| VRA–KRE | 412 / 188 / 0 | 446 / 154 / 0 |
| ZAN–KRE | 431 / 169 / 0 | 442 / 157 / 1 |

The largest measured loss is EAR against ZAN: 83 fewer wins in 600 battles, −13.83 pp. ZAN gains 82 wins there; the remaining battle becomes a draw. EAR also loses 31 wins against VRA, but gains 23 against KRE. VRA gains 34 wins against KRE. Across all three opponents, EAR moves 40.22% → 35.17%, VRA 55.61% → 59.72%, ZAN 64.83% → 69.50%, and KRE 38.78% → 35.06%. Radius four therefore benefits ZAN and VRA overall in this control. This is a measured downstream balance effect, not a claim to have isolated a particular fleet maneuver. The complete scale, maneuver-index and shape-matrix changes are preserved in [the full trial diff](05-pd4-fleet.diff).

Validation is green: 47 fast-suite programs, including 18 new engine regression groups. Added coverage includes all 29 hulls in legacy/stock/engineering-upgraded forms, mount priority/hold/expiry, both previews, hidden launchers/defenders, all damage paths, terminal losses, crippling, scan-lock destruction, and zero/one PD draws. [Final complete suite output](14-final-fast.log).

Every successful behavior boundary through the numeric-mount fix produced the **same complete fast-suite output bytes** as baseline: SHA-256 8147bd2d433077ec83f52a02a9d023adca58854b3858016550e185a2abb63c45. The initial PD and scenario runs failed their historical exact-value pins; those tests were narrowly amended and rerun green. After adding regressions, the only original-output changes are sensing assertions 3590 → 3598 and player-contact assertions 118 → 126, plus the new 18-group test block. Removing exactly those added diagnostics reproduces the entire original output byte-for-byte. The later explicit wreck-target guard is also output-identical. [Output audit and hashes](output-audit.json); [first test-extension diff](10-extended-fast.diff); [final test-extension diff](14-final-fast.diff).

Mandatory observation/record additions intentionally change serialized data: torpedoes, wrecks, wreckedTurn, destruction records and PD defenders. Requested turn-after/mount orders intentionally alter only battles that use them; radius four and the Asterion limits intentionally alter balance/termination. The deterministic comparison runs original 0abbcef source and the final source at the same radius-four tuning across 144 paired battles (288 executions), covering all six faction pairings, three sensing modes, and ordered/scripted movement. It compares full ship state, PRNG state, missiles, locks, shield readings, stats, results, per-round state, raw shots, and narrative bytes, removing **only** the additive wreckedTurn, wrecks, and defenderIds fields. All match across 1,543 turns and 4,529 round snapshots. [Preservation report](preservation.json).

Reproduction commands (run from the repository root):

```text
node test/run-tests.js
node test/fleet-trial.js --battles 300
node test/playtest-balance.mjs --battles 300 --out balance-isolation.json
node test/playtest-preservation.mjs --baseline .tmp-playtest/published-head --out preservation.json
```

The ignored .tmp-playtest/published-head source was extracted read-only from git archive 0abbcef; it is available locally for review, and no checkout or commit was made. [Exact balance counts and paired transitions](balance-isolation.json); [baseline full trial](00-baseline-fleet.log); [radius-four full trial](05-pd4-fleet.log). git diff --check passes. No browser acceptance of the separate console changes is claimed.
