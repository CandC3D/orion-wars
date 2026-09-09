# Chris-authored stock fleet — supplied design revision 2

Historical publication record. The two subsequent Vraygon stock r3 changes are
documented in [the September 6 amendment](../stock-amendments-2026-09-06/README.md).
This original return manifest and its captured evidence remain unchanged.

All 29 returned designs are published as the supplied faction stock. The final
KRE destroyer input is `kre-destroyer-variant-corrected-arcs-r3.drydock.json` from
the KSN return directory. Original exports are untouched. `approved-designs.json`
retains their full content, filenames and original SHA-256 hashes.

## Published scope

- EAR 7, KRE 8, VRA 7, ZAN 7: exact per-installation firing faces, physical X/Y/Z
  positions and orientation, in the returned weapon order. Custom and asymmetric
  face sets stay exact; no mirroring, arc cycling, snapping or redesign is applied.
- VRA monitor: **24 points, 32 shared missile magazine, 220 effective structure**,
  approved as a slow, heavily armed and armored mobile battlestation. The tuning
  base structure is 122, multiplied once by VRA's existing 1.8 and rounded to 220.
  Its 12 weapons, reactor output, shields and movement cost (8.75 P/hex), and its
  existing fleet-floor policy remain otherwise unchanged. Points are a real game
  input, not just a UI label: current purchase totals and point-based rules use 24.
- Weapon definitions, counts/types, reach, power and all other ship statistics
  remain as supplied before this update. There is no claim of balance approval or
  old-versus-new battle outcome equivalence after intentional arc changes.
- Canonical stock design IDs, class keys, faction codes and catalogue numbers
  1–29 remain stable. Returned variant UUIDs and names are not stock identities.
  Stock **design** revision is 2; pack format/profile remains V1. This is not an
  automatic conversion to the V2 component-engineering format.

`data/loadouts.json` now contains explicit stock mounts. `legacySpec` validates
and uses them for browser and headless construction. Historical/custom loadouts
without the field still use the old count/arc-cycle adapter. Drydock derives its
editable packs from the same source. New headless recordings retain explicit
mount geometry, just as the playfield snapshots do.

## Seeing and adopting the supplied fleet

Reload Drydock, then select the desired **stock** ship. Reload may first recover
your existing draft; recovery does not replace it with new stock.

Your browser-local stock revisions deliberately take precedence, even if they
also say r2. They are independent saved content, not a remotely updated reference.
To adopt the supplied layout for such a ship: **Unlock stock → Restore supplied
stock… → Review & save stock revision**. Review shows changes; saving appends the
next local revision and relocks. Old revisions and variants are not deleted.
Export any unsaved draft before replacing it.

Fully pinned `designPack` scenarios, saved variants, existing battles and recorded
games keep their content. Class-only scenarios are intentionally different: they
name a current stock class, so constructing a new battle uses today's supplied
defaults (unless an explicit browser-local override is applied by that workflow).
Existing replay files are not rewritten or re-recorded. Replaying recorded events
does not consult the new stock tables; restarting a class-only scenario is a new
construction, not restoration of unavailable historical specifications.

## Verification

- `node test/stock-promotion.js`: eight groups; all 29 packs equal the returns
  after canonical identity normalization; all effective hull/mount data survives
  ordinary construction, live views and 29 headless recordings; 29 fully pinned
  historical comparisons are exact; local override/restore isolation and invalid
  explicit-mount rejection pass. Non-layout differences are restricted to the
  three monitor values and publication metadata.
- `node docs/drydock/verify-stock.mjs`: the original 29 ship hashes, 12 seeded
  recordings and 12 forecasts still match using the byte-preserved files in
  `baseline/`. The original hash oracle was not regenerated for the new fleet.
- `verify-stock-promotion.mjs` drives fresh headless Edge on Astra's separate
  listener: all 29 packs, every actual SVG mount transform and face title,
  monitor controls and 56-point monitor/battleship quick fleets, class-only
  scenario-editor behavior, old local stock priority and reviewed append-only
  restoration. Five groups, zero page errors. Evidence in `browser/`.
- Existing browser tests updated only where they asserted replaced stock data:
  the old Earth LC blind face/first arc, and an assumed starting stock revision 1.
  The AI movement-cost fixture pins its historical threat arcs locally so it
  continues testing cost rejection rather than the fleet redesign.
- Full Drydock runner includes the promotion browser check. User port 8642 and
  user browser storage remain untouched. Frozen audit inputs are hash-checked.

Independent Fable review is prepared in
`docs/dispatch/fable-stock-promotion-2026-09-05/`; acceptance/results must be
reported separately, not inferred from Astra's passing tests.
