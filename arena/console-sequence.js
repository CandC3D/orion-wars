// The maneuver sequence instrument. Chris, 10 September 2026: turns may come before or after the
// linear move - and, the same evening, "you can do better than a bloody checkbox. this is not a web
// site - it is the command console of an advanced fighting starship."
//
// Two lit keys beside the heading rose, each carrying a pictogram of the path it produces:
//   TURN, RUN  pivot in the start hex, then run along the new heading
//   RUN, TURN  run along the present heading, then pivot in the end hex
// The engine's field is `turnAfter: true` or absent; these keys are its only control.
const f = v => v.toFixed(1);

// Pictograms in a 44 x 26 box. The ship starts at the dot heading right (present heading); the new
// heading is up and to the right. Stroke and fill are currentColor, so a lit key inverts cleanly.
function arrowHead(tip, from, size = 5) {
  const dx = tip.x - from.x, dy = tip.y - from.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const bx = tip.x - ux * size, by = tip.y - uy * size, px = -uy * size * .55, py = ux * size * .55;
  return `<path d="M${f(tip.x)},${f(tip.y)}L${f(bx + px)},${f(by + py)}L${f(bx - px)},${f(by - py)}Z" fill="currentColor"/>`;
}
function pivot(at, r = 6) {
  // A short arc swept from the present heading (right) to the new one (up-right, -60 degrees).
  const a = { x: at.x + r, y: at.y }, b = { x: at.x + r * Math.cos(-Math.PI / 3), y: at.y + r * Math.sin(-Math.PI / 3) };
  return `<path d="M${f(a.x)},${f(a.y)}A${r},${r} 0 0 0 ${f(b.x)},${f(b.y)}" fill="none" stroke="currentColor" stroke-width="1.6"/>`
    + arrowHead(b, { x: b.x + 2.4, y: b.y + 1.4 }, 3.4);
}
const NEW = { x: Math.cos(-Math.PI / 3), y: Math.sin(-Math.PI / 3) };
export function sequencePictogram(kind) {
  const start = { x: 6, y: 20 }, body = [`<circle cx="${start.x}" cy="${start.y}" r="2.4" fill="currentColor"/>`];
  if (kind === 'turn-first') {
    const tip = { x: start.x + NEW.x * 26, y: start.y + NEW.y * 20 };
    body.push(pivot(start), `<path d="M${start.x},${start.y}L${f(tip.x)},${f(tip.y)}" stroke="currentColor" stroke-width="2"/>`, arrowHead(tip, start));
  } else {
    const end = { x: 30, y: 20 }, tip = { x: end.x + NEW.x * 12, y: end.y + NEW.y * 12 };
    body.push(`<path d="M${start.x},${start.y}L${end.x},${end.y}" stroke="currentColor" stroke-width="2"/>`, pivot(end),
      `<path d="M${end.x},${end.y}L${f(tip.x)},${f(tip.y)}" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/>`);
  }
  return `<svg class="sequence-glyph" viewBox="0 0 44 26" width="44" height="26" aria-hidden="true">${body.join('')}</svg>`;
}

// Why the keys are dark, when they are: a sequence only means something with both a turn and a run.
export function sequenceState(action, kind) {
  if (!action || kind !== 'move') return { enabled: false, reason: 'Sequence applies to a maneuver' };
  if (!action.turn) return { enabled: false, reason: 'No turn in this action' };
  if (!action.forward && !action.burst) return { enabled: false, reason: 'Turning in place: nothing to sequence' };
  return { enabled: true, reason: '' };
}

export function sequenceKeysMarkup(action, kind, editable) {
  const st = sequenceState(action, kind), after = !!action?.turnAfter, on = editable && st.enabled;
  const key = (value, label, pressed, title) =>
    `<button type="button" class="console-key sequence-key" data-sequence="${value}" aria-pressed="${pressed}" ${on ? '' : 'disabled'} title="${title}${st.reason ? ' · ' + st.reason : ''}">${sequencePictogram(value)}<span>${label}</span></button>`;
  return key('turn-first', 'Turn · run', !after, 'Pivot in the start hex, then run along the new heading')
    + key('run-first', 'Run · turn', after, 'Run along the present heading, then pivot in the end hex');
}
