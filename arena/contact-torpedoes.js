// Torpedoes in flight. Chris, 10 September 2026: torpedoes should "remain on the map", pausing on
// their way and following a defender that moves.
//
// The engine flies a torpedo across the turn boundary: it launches, homes on its target's current
// hex at each round's end, and arrives before the next refill. Between turns it is somewhere on
// the way, and `observation.torpedoes[]` says where - but only what this side may know:
//   - own torpedoes are telemetry: launch hex, current position and target always;
//   - an incoming torpedo shows its course only while its launcher is a live contact. Its
//     position would otherwise reveal where an unseen ship fired from, so it comes with none,
//     and this draws a warning on the ship it is aimed at instead of inventing a track.
// Nothing here reads a missile record, a flight path or a launcher the observation withheld.
const OWN = '#efb773', INCOMING = '#ff8a73';
const f = v => v.toFixed(1);

// Where the torpedo's target stands in this picture: an own hull, or a live contact.
function targetOf(view, id) {
  const own = view.own.find(s => s.id === id && !s.destroyed);
  if (own) return own;
  return view.contacts.find(c => c.id === id && !c.destroyed) ?? null;
}

export function torpedoMarkup(view, { project, scale, icon }) {
  const flights = Array.isArray(view?.torpedoes) ? view.torpedoes : [];
  if (!flights.length || typeof project !== 'function') return '';
  const size = Math.max(4, Math.min(icon * 0.42, scale * 0.45));
  let svg = '';
  const blind = new Map();
  // A salvo flies as one: tubes fired together from one hull at one target share a course sample
  // exactly. Draw each shared position once, with its count, rather than stacking identical marks.
  const salvos = new Map();
  for (const t of flights) {
    const key = t.pos ? `${t.direction}|${t.targetId}|${t.pos.q.toFixed(3)},${t.pos.r.toFixed(3)}` : `blind|${t.id}`;
    const entry = salvos.get(key);
    if (entry) entry.count++; else salvos.set(key, { ...t, count: 1, ids: [] });
    salvos.get(key).ids.push(t.id);
  }
  for (const t of salvos.values()) {
    const outgoing = t.direction === 'outgoing', colour = outgoing ? OWN : INCOMING;
    const target = targetOf(view, t.targetId);
    if (!t.pos) {
      // Course withheld: count the warning against the hull it threatens.
      if (!outgoing && target) blind.set(target.id, (blind.get(target.id) ?? 0) + t.count);
      continue;
    }
    const at = project(t.pos), from = t.launchPos ? project(t.launchPos) : null, to = target ? project(target.pos) : null;
    // Bearing: toward the target if it is in the picture, else along the flown leg.
    const aim = to && Math.hypot(to.x - at.x, to.y - at.y) > 0.5 ? to : from ? { x: 2 * at.x - from.x, y: 2 * at.y - from.y } : null;
    const deg = aim ? Math.atan2(aim.y - at.y, aim.x - at.x) * 180 / Math.PI : 0;
    const who = target?.vesselName?.full ?? target?.displayName ?? t.targetId;
    svg += `<g class="torpedo" data-torpedo="${t.ids.join(' ')}" data-count="${t.count}" data-direction="${outgoing ? 'outgoing' : 'incoming'}" pointer-events="none">`
      + `<title>${t.count > 1 ? t.count + ' ' : ''}${outgoing ? 'Own torpedo' : 'Incoming torpedo'}${t.count > 1 ? 'es' : ''} · target ${who} · arrives before the next refill; it follows the target if it moves</title>`
      + (from ? `<line x1="${f(from.x)}" y1="${f(from.y)}" x2="${f(at.x)}" y2="${f(at.y)}" stroke="${colour}" stroke-opacity=".35" stroke-width="1.2"/>` : '')
      + (to ? `<line x1="${f(at.x)}" y1="${f(at.y)}" x2="${f(to.x)}" y2="${f(to.y)}" stroke="${colour}" stroke-opacity=".7" stroke-width="1.2" stroke-dasharray="2 4"/>` : '')
      + `<path d="M${f(size)},0L${f(-size * .7)},${f(-size * .5)}L${f(-size * .35)},0L${f(-size * .7)},${f(size * .5)}Z" transform="translate(${f(at.x)} ${f(at.y)}) rotate(${f(deg)})" fill="${colour}" stroke="#060e15" stroke-width="1"/>`
      + (t.count > 1 ? `<text x="${f(at.x + size * .9)}" y="${f(at.y - size * .7)}" font-size="${f(Math.max(9, size * 1.4))}" fill="${colour}" stroke="#060e15" stroke-width="3" paint-order="stroke" font-weight="bold">×${t.count}</text>` : '')
      + `</g>`;
  }
  for (const [id, count] of blind) {
    const ship = view.own.find(s => s.id === id), p = project(ship.pos), r = scale * 0.62;
    svg += `<g class="torpedo-warning" data-torpedo-warning="${id}" pointer-events="none">`
      + `<title>${count} incoming torpedo${count === 1 ? '' : 'es'} · launcher not in contact, course unknown · arrives before the next refill</title>`
      + `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}" fill="none" stroke="${INCOMING}" stroke-width="1.5" stroke-dasharray="3 3"/>`
      + `<text x="${f(p.x + r * .75)}" y="${f(p.y - r * .75)}" font-size="${f(Math.max(9, size * 1.6))}" fill="${INCOMING}" stroke="#060e15" stroke-width="3" paint-order="stroke" font-weight="bold">▲${count > 1 ? count : ''}</text>`
      + `</g>`;
  }
  return svg;
}

// The dock line: what is in the air, in words.
export function torpedoSummary(view) {
  const flights = Array.isArray(view?.torpedoes) ? view.torpedoes : [];
  const out = flights.filter(t => t.direction === 'outgoing').length, inc = flights.filter(t => t.direction !== 'outgoing').length;
  const incoming = view?.incoming?.length ?? inc;
  const parts = [];
  if (incoming) parts.push(`${incoming} incoming to own vessels`);
  if (out) parts.push(`${out} own in flight`);
  return parts.length ? `Torpedoes: ${parts.join(' · ')} · arrive before next refill` : 'No torpedoes in flight';
}
