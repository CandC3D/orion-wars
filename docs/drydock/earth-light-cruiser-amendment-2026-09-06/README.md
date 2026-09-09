# Earth light-cruiser beam 1 correction — 6 September 2026

Chris supplied ear-light-cruiser-corrected-arcs-r3.drydock.json because beam 1's
arc was too wide. The export differs from published stock only in variant
identity/name/revision and beam 1's faces: **1,2,3,6 → 1,2,6**. Face 3
(forward-starboard) is removed. Position (-1, 0.7, 0), every other installation,
hull specification and pinned weapon definition remain exact.

The canonical Earth light cruiser becomes supplied **stock r3**, retaining its
stock identity, name and numerical catalogue reference. All other 28 stock packs
are unchanged, including the two Vraygon r3 amendments. The original September 5
return and separate Vraygon amendment manifest remain immutable historical inputs;
the test oracle adds this approval without rewriting either.

approved-designs.json preserves the returned pack, original path and SHA-256.
test/stock-earth-light-cruiser.mjs checks the content delta, all 36 combinations
of ship heading and target bearing in actual fire and forecasts, six old-r2
forward-starboard positive controls, view/recording geometry, 28 unchanged packs
and append-only pinned history. verify.mjs runs the full fast suite and checks
the frozen Fable warp/burst source and log remain unchanged. Results are in
verification.json and fast-tests.log. The reused rendered stock verifier writes
new evidence under browser/ with STOCK_BROWSER_OUT, never over old screenshots.

Verification completed: full fast suite exit 0; all six focused groups pass.
The rendered verifier passes five groups with zero page exceptions, checking
all 29 actual schematic placements/face captions and supplied revision labels.
EAR-light-cruiser-supplied-r3.png was visually inspected. The isolated headless
Edge listener on 8873 was stopped afterward; the user's 8642 session was untouched.

## Seeing the correction

Reload Drydock and select the Earth stock light cruiser. Browser-local stock
overrides still take precedence: if one exists, explicitly use Unlock stock →
Restore supplied stock → Review & save stock revision to adopt it. Saving
appends a new local revision; a supplied r3 saved over local r2 becomes local r4.
Existing variants and pinned games retain their original beam arcs. Nothing in
Chris's browser storage was edited. New class-only battles use corrected stock.

## Review boundary

Fable's special-command candidate BCO4L4 remains frozen with the older EAR light
cruiser r2. This correction is live only until a subsequent candidate includes
it; no independent acceptance is implied for it. It does not resume deferred
Drydock feature work, change engine geometry, implement the remaining engine
rulings or start the consolidated balance sweep.
