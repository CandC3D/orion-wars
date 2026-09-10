// What is left where a ship died. Chris, 10 September 2026: "leave an icon / marker of ship debris
// where destroyed ships were (make at least 3 for variety) to stand in where the living ship icon was
// at the time of its destruction."
//
// Three variants, chosen from the ship id rather than at random: the wreck of IKS Honor is the same
// wreck every time the picture is redrawn, on every replay, on every machine. The engine's PRNG is
// never touched - this is a display hash, not a roll.
//
// Drawn at the dead ship's last heading, sized to the icon it replaces, in dead-metal tones with one
// dim ember so a debris field reads as having been a ship rather than as terrain. Nothing here uses
// the faction colour: a wreck is no longer anybody's.
const METAL = '#6f7a80', DARK = '#3d464b', EMBER = '#d9824a';

// FNV-1a over the id, then a murmur3 finaliser. FNV alone clustered badly here: ship ids differ only
// in their last characters (A-light-cruiser-1, -2, -3), and its low bits followed them, putting six of
// eight real ids on one variant. The finaliser avalanches every input bit across the result.
export function debrisVariant(id) {
  let h = 2166136261 >>> 0;
  for (const ch of String(id ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return (h >>> 0) % DEBRIS_VARIANTS.length;
}

const f = v => v.toFixed(1);
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${fill}"${extra}/>`;

// Each variant is authored in a unit box roughly -1..1 and scaled to the icon.
export const DEBRIS_VARIANTS = [
  // 0 · BROKEN SPINE: the hull snapped in two, the halves drifting apart, shards between.
  s => poly([[-1, -.3], [-.15, -.42], [-.05, -.05], [-.2, .28], [-.95, .22]], METAL, ` stroke="${DARK}" stroke-width="${f(s * .04)}"`)
    + poly([[.22, -.25], [.95, -.12], [.85, .3], [.3, .34], [.1, .05]], METAL, ` stroke="${DARK}" stroke-width="${f(s * .04)}"`)
    + poly([[-.02, -.55], [.08, -.5], [.02, -.4]], DARK) + poly([[.02, .42], [.12, .5], [-.03, .56]], DARK)
    + `<circle cx="0" cy="0" r=".09" fill="${EMBER}" opacity=".85"/>`,
  // 1 · SCATTER: nothing large survived; a ring of shards round a faint scorch.
  s => `<circle cx="0" cy="0" r=".55" fill="${DARK}" opacity=".35"/>`
    + [[0, -.72, 0], [.66, -.28, 60], [.5, .55, 125], [-.34, .66, 190], [-.72, .08, 250], [-.3, -.55, 305]]
      .map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})">${poly([[-.16, -.07], [.18, -.04], [.08, .09], [-.12, .07]], METAL)}</g>`).join('')
    + `<circle cx=".08" cy="-.06" r=".07" fill="${EMBER}" opacity=".8"/><circle cx="-.12" cy=".1" r=".045" fill="${EMBER}" opacity=".55"/>`,
  // 2 · HULK: one large jagged piece still recognisably a hull, a fracture across it, two small bits.
  s => poly([[-.95, -.2], [-.3, -.48], [.55, -.38], [.9, -.05], [.62, .32], [-.1, .45], [-.8, .28]], METAL, ` stroke="${DARK}" stroke-width="${f(s * .04)}"`)
    + `<path d="M-.4,-.44 L-.18,-.05 L-.36,.18 L-.12,.44" fill="none" stroke="${DARK}" stroke-width="${f(s * .06)}" stroke-linejoin="bevel"/>`
    + poly([[.88, .42], [1, .5], [.9, .6]], DARK) + poly([[-1, .45], [-.9, .52], [-1.02, .58]], DARK)
    + `<circle cx="-.26" cy=".04" r=".08" fill="${EMBER}" opacity=".8"/>`
];

// The marker, centred on the dead ship's last position, turned to its last heading.
export function debrisMarkup(ship, centre, iconSize) {
  if (!ship || !centre || !(iconSize > 0)) return '';
  const variant = debrisVariant(ship.id), half = iconSize * 0.55, heading = -60 * (Number(ship.facing) || 0);
  return `<g class="debris" data-debris-variant="${variant}" transform="translate(${f(centre.x)} ${f(centre.y)}) rotate(${heading}) scale(${f(half)})">`
    + DEBRIS_VARIANTS[variant](1)
    + `</g>`;
}
