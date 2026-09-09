# Vraygon stock amendments — 2026-09-06

Integrated by Astra under Chris's rulings recorded by Fable in
`docs/tactical-design.md` sections 34a and 34b, including the confirmed trim.
This is a ship-data amendment, not
integration of the eleven engine rulings in section 34, and not a balance verdict.

## Supplied content

- **VRA heavy cruiser:** Chris's variant r3, rear beam (mount 5) restricted to
  face 5, at the supplied position `(0, -1, 0)`. The already-published explicit
  mount was aft 180 (4,5,6); this narrows it to dead astern. The older legacy
  fallback's four-entry beam list also gains a fifth `a`, eliminating its wrap.
- **VRA destroyer:** Chris's variant r4, one forward missile tube, positioned
  exactly as supplied at `(0, 0.85, 0)`. The second tube is removed. Magazine
  remains six rounds; weapon definitions, prices and all other hull values stay
  unchanged. The legacy missile count is corrected from two to one as well.
- Both canonical supplied designs become **stock r3**. A returned variant's
  revision number belongs to that variant, not to the canonical stock identity.
  Catalogue numbers remain **17** (destroyer) and **20** (heavy cruiser).
  The other 27 supplied designs retain their r2 content and identities exactly.

`approved-designs.json` preserves both new exported packs and their original
filenames, paths and SHA-256 hashes. The September 5 approval manifest, original
exports, recorded games and frozen review candidates are untouched. Test oracles
overlay these two approvals onto the original 29; they do not overwrite history.

## Narrow cleanup and deferred decisions

The battleship missile list is trimmed from seven entries to five, and the
monitor missile list from six to five. Only the unused suffixes are removed;
both explicit installations and legacy cyclic mount output are unchanged.

The monitor's **six beam arcs for seven beams are not unused trailing entries**.
That legacy adapter list cycles; it is unchanged. The seven explicit promoted
beam installations do not depend on it and also remain unchanged.

Section 34b supersedes the September 4 blind-face/wrapped-mount findings: those
described pre-promotion stock, not the current authored layouts. They are not an
open repair queue. The approved faction doctrines are Earth all-round including
rear; Krelath forward-heavy with minimal rear; Vraygon broadsides with light rear;
and Zandrax forward-only with little side or rear. No additional coverage,
symmetry, or ship redesign is inferred from the old findings.

## Loading the update

Reload Drydock and select the supplied Vraygon stock ship. Local saved stock
still takes precedence. To adopt the new supplied layout over a local revision,
use **Unlock stock → Restore supplied stock… → Review & save stock revision**.
Saving appends a revision; it does not overwrite the earlier one. In the tested
case, supplied r3 saved over local r2 becomes local r4.

Variants, pinned scenarios and existing battles retain their old definitions.
Class-only scenarios use current stock when a new battle is constructed. No
browser storage was changed in Chris's session.

## Verification

- Full `node test/run-tests.js`: exit 0 before and after this amendment.
- `node test/stock-promotion.js`: 8 groups, all 29 latest approved packs,
  construction/views/recordings and historical pinned comparisons.
- `node test/stock-amendments.js`: 7 groups, including 36 live rotated firing
  trials with matching forecasts, an actual one-round destroyer launch with
  the old two-tube fit as a positive control, exact preservation of the other
  27 stock packs, and both old r2 designs surviving local restore and fully
  pinned recorded battles.
- `docs/drydock/verify-stock-promotion.mjs`: 5 rendered groups, all 29 packs,
  actual SVG mount positions and face captions, revision labels, trial fleet
  construction and append-only local stock restoration. Fresh headless Edge
  context on Astra's owned `127.0.0.1:8847`; zero page exceptions. Listener
  stopped; Chris's `8642` session untouched. Evidence is in `browser/`.
- Captain R2 frozen source `20Cgr3`: all 145 listed hashes, inventory and fast
  log re-verified unchanged. This amendment does not alter its review input.

`verification.json` records the current source hashes and measured results.
Independent Fable acceptance of this stock amendment has not been requested or
claimed. Section 34e gates one consolidated balance sweep on the ship amendments,
engine-rule batch and C0.1 corrections. Historical balance figures remain
historical; no sweep was started here.

The subsequent Drydock/presentation decisions in section 34c are agreed but
deferred without a schedule. This amendment does not resume Drydock work or
implement the CSV comparison, replay-version, catalogue or ship-card follow-ups.

The rendered destroyer still exposes the existing long floating-point efficiency
value in its editable hull field. That presentation issue was not changed here.
