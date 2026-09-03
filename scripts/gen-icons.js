// Schematic unit icons for the playtest phase: one SVG per faction x class,
// built so faction reads from colour + hull family and class reads from size
// + rank bars, at 24-48 px on a hex map. Nose points UP; the viewer rotates
// by facing. Regenerate with: node scripts/gen-icons.js
import { writeFileSync, mkdirSync } from "node:fs";

const FACTIONS = {
  EAR: { color: "#4f8ef7", dark: "#1e3a8a", name: "Earth Federation" },
  VRA: { color: "#e2b53a", dark: "#7c5a0b", name: "Vraygon Star Realm" },
  ZAN: { color: "#e8483f", dark: "#7f1d1d", name: "Zandrax Horde" },
  KRE: { color: "#3fbf5a", dark: "#14532d", name: "Krelath Empire" }
};

// size = footprint of the hull (fraction of the 64-box); bars = rank marks.
const CLASSES = {
  corvette:         { size: 0.42, bars: 0, glyph: "dot",     abbr: "CT" },
  frigate:          { size: 0.52, bars: 1, glyph: null,      abbr: "FF" },
  destroyer:        { size: 0.60, bars: 2, glyph: null,      abbr: "DD" },
  "missile-destroyer": { size: 0.60, bars: 2, glyph: "missile", abbr: "DM" },
  "light-cruiser":  { size: 0.70, bars: 3, glyph: null,      abbr: "CL" },
  "strike-cruiser": { size: 0.70, bars: 3, glyph: "missile", abbr: "CS" },
  "heavy-cruiser":  { size: 0.82, bars: 4, glyph: null,      abbr: "CA" },
  "command-ship":   { size: 0.82, bars: 4, glyph: "star",    abbr: "CC" },
  "gunstar-battlecruiser":      { size: 0.90, bars: 4, glyph: "spinal",  abbr: "GB" },
  carrier:          { size: 0.90, bars: 3, glyph: "deck",    abbr: "CV" },
  battleship:       { size: 1.00, bars: 5, glyph: null,      abbr: "BB" },
  monitor:          { size: 1.00, bars: 5, glyph: "fort",    abbr: "MN" },
  // Small craft: a common silhouette per type (not the faction hull family), so
  // they read as aircraft rather than tiny ships, in faction colour.
  interceptor:      { size: 0.30, bars: 0, glyph: null,      abbr: "IN", craft: "interceptor" },
  bomber:           { size: 0.36, bars: 0, glyph: "payload", abbr: "BM", craft: "bomber" }
};

const CRAFT = {
  interceptor: `M50 2 L60 40 L92 62 L60 56 L56 92 L50 84 L44 92 L40 56 L8 62 L40 40 Z`,   // slim swept dart
  bomber:      `M50 4 L70 36 L94 48 L94 58 L68 60 L70 92 L50 82 L30 92 L32 60 L6 58 L6 48 L30 36 Z` // broad wedge
};

// Hull families, drawn in a 100x100 space with the nose at the top.
const HULL = {
  EAR: `M50 4 C68 4 78 22 78 40 L78 68 C78 82 66 92 50 96 C34 92 22 82 22 68 L22 40 C22 22 32 4 50 4 Z`,           // rounded saucer-lozenge
  VRA: `M50 2 L84 30 L84 70 L50 98 L16 70 L16 30 Z`,                                                            // faceted crystal
  ZAN: `M50 2 L92 92 L50 76 L8 92 Z`,                                                                            // arrowhead
  KRE: `M50 4 C70 4 82 20 82 36 L82 44 L70 44 L70 52 L82 52 L82 62 C82 80 68 96 50 96 C32 96 18 80 18 62 L18 52 L30 52 L30 44 L18 44 L18 36 C18 20 30 4 50 4 Z` // segmented carapace
};

function glyphSvg(kind, c) {
  switch (kind) {
    case "dot":     return `<circle cx="50" cy="52" r="6" fill="${c.dark}"/>`;
    case "missile": return `<path d="M42 62 L50 46 L58 62 Z" fill="#fff" opacity="0.9"/>`;
    case "star":    return `<path d="M50 40 L54 50 L64 50 L56 56 L59 66 L50 60 L41 66 L44 56 L36 50 L46 50 Z" fill="#fff" opacity="0.9"/>`;
    case "spinal":  return `<rect x="47" y="6" width="6" height="58" rx="3" fill="#fff" opacity="0.95"/>`;
    case "deck":    return `<rect x="36" y="18" width="28" height="56" rx="3" fill="none" stroke="#fff" stroke-width="4" opacity="0.9"/><path d="M50 22 L50 70" stroke="#fff" stroke-width="3" stroke-dasharray="6 5" opacity="0.9"/>`;
    case "fort":    return `<rect x="38" y="38" width="24" height="24" fill="none" stroke="#fff" stroke-width="5" opacity="0.9"/>`;
    case "payload": return `<circle cx="50" cy="56" r="9" fill="${c.dark}" stroke="#fff" stroke-width="3" opacity="0.95"/>`;
    default: return "";
  }
}

function barsSvg(n, c) {
  if (!n) return "";
  const out = [];
  const w = 36, h = 6, gap = 3, total = n * h + (n - 1) * gap;
  let y = 92 - total;
  for (let i = 0; i < n; i++) { out.push(`<rect x="${50 - w / 2}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="#fff" opacity="0.92"/>`); y += h + gap; }
  return out.join("");
}

function icon(fac, cls) {
  const f = FACTIONS[fac], k = CLASSES[cls];
  const s = k.size, t = (1 - s) * 50; // centre the scaled hull in the 100 box
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="64" height="64">
<g transform="translate(${t} ${t}) scale(${s})">
<path d="${k.craft ? CRAFT[k.craft] : HULL[fac]}" fill="${f.color}" stroke="${f.dark}" stroke-width="5" stroke-linejoin="round"/>
${glyphSvg(k.glyph, f)}${barsSvg(k.bars, f)}
</g></svg>`;
}

mkdirSync("assets/icons", { recursive: true });
const manifest = {};
const cells = [];
for (const fac of Object.keys(FACTIONS)) {
  for (const cls of Object.keys(CLASSES)) {
    const file = `${fac.toLowerCase()}_${cls.replace(/-/g, "_")}.svg`;
    writeFileSync(`assets/icons/${file}`, icon(fac, cls));
    manifest[`${fac}/${cls}`] = { file, size: CLASSES[cls].size, abbr: CLASSES[cls].abbr };
    cells.push({ fac, cls, file });
  }
}
writeFileSync("assets/icons/manifest.json", JSON.stringify({ noseUp: true, factions: FACTIONS, classes: CLASSES, icons: manifest }, null, 2));

// Contact sheet: every icon at map size (32px) and at 64px, on the arena's dark ground.
const order = Object.keys(CLASSES);
const rows = Object.keys(FACTIONS).map((fac) => `<tr><th>${FACTIONS[fac].name}</th>` +
  order.map((cls) => { const file = `${fac.toLowerCase()}_${cls.replace(/-/g, "_")}.svg`;
    return `<td><img src="${file}" width="64" height="64"><br><img src="${file}" width="28" height="28"><div>${CLASSES[cls].abbr}</div></td>`; }).join("") + "</tr>").join("\n");
writeFileSync("assets/icons/contact-sheet.html", `<!doctype html><meta charset="utf-8"><title>Orion Wars unit icons</title>
<style>body{background:#0b1220;color:#cbd5e1;font:13px system-ui;padding:20px}table{border-collapse:collapse}th{text-align:left;padding:8px 14px 8px 0;white-space:nowrap}td{text-align:center;padding:8px 6px;border-top:1px solid #1e293b}td div{font-size:11px;color:#94a3b8;margin-top:2px}h1{font-weight:500;font-size:18px}</style>
<h1>Orion Wars — playtest unit icons (64px and map-size 28px)</h1>
<table><tr><th></th>${order.map((c) => `<th style="text-align:center">${c}</th>`).join("")}</tr>${rows}</table>`);
console.log(`wrote ${cells.length} icons + manifest + contact-sheet.html`);
