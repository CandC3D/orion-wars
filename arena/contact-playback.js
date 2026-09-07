// Presentation clock for restricted combat playback. It paces already-projected
// frames and events for the eye: it never steps the engine, issues orders,
// alters recorded frames or events, or reads anything but what it is handed.
// Pause, resume, skip and cancel are the only controls; a cancelled run stops
// its animations and resolves. Reduced motion collapses every duration to zero
// while still visiting every frame and announcing every event.
export function createPlayback({ now = () => performance.now(), raf = fn => requestAnimationFrame(fn) } = {}) {
  let token = 0, paused = false, skipping = false, wake = null, pausedAt = null, pausedTotal = 0;
  // ledger of wall time spent paused; settled on resume/skip/cancel so a pause released between two frames still counts
  const pausedTime = () => pausedTotal + (paused ? now() - pausedAt : 0);
  const unpause = () => { if (paused) pausedTotal += now() - pausedAt; paused = false; pausedAt = null; };
  const waiters = new Set();
  const notify = () => { for (const w of [...waiters]) { waiters.delete(w); w(); } };
  const rest = () => new Promise(resolve => waiters.add(resolve));
  const api = {
    get paused() { return paused; }, get skipping() { return skipping; }, get running() { return wake !== null; },
    pause() { if (wake && !paused) { paused = true; pausedAt = now(); } },
    resume() { unpause(); notify(); },
    skip() { skipping = true; unpause(); notify(); },
    cancel() { token++; unpause(); skipping = false; wake = null; notify(); },
    // items: [{frame, events}] in order. hooks: onFrame(index), onEvent(event, index, eventIndex),
    // onTick(event, phase), onEventEnd(event), durationFor(event) -> ms, reduced() -> bool.
    async run(items, { onFrame, onEvent, onTick, onEventEnd, durationFor, reduced = () => false, frameBeat = 120 }) {
      const mine = ++token; wake = notify; skipping = false; paused = false;
      const alive = () => token === mine;
      const settle = async () => { while (alive() && paused) await rest(); return alive(); };
      // Hold for `ms` of ACTIVE time: wall time spent paused (per the ledger) is excluded, so an effect resumes at the
      // phase it was paused at. Ends early on skip or cancel. onPhase receives 0..1 of active progress.
      const hold = async (ms, onPhase) => {
        ms=Math.max(0,Number(ms)||0);
        if(ms===0){if(alive()&&!skipping)onPhase?.(1);return;}
        const began = now(), debt0 = pausedTime(); let phase = 0;
        while (alive() && !skipping && phase < 1) {
          if (paused) { await rest(); if (!alive()) return; continue; }
          phase = Math.min(1, (now() - began - (pausedTime() - debt0)) / ms); onPhase?.(phase);
          if (phase >= 1) break;
          await new Promise(resolve => raf(resolve));
        }
      };
      for (let i = 0; i < items.length; i++) {
        if (!(await settle())) break;
        // Frame transitions use this run's active-time clock too. In particular
        // pause, skip and cancel must not leave a separate animation running.
        const framed = onFrame?.(i, { hold, alive }); if (framed && typeof framed.then === 'function') await framed; if (!alive()) break;
        const events = items[i].events || [];
        for (let e = 0; e < events.length; e++) {
          if (!(await settle())) break;
          const event = events[e]; onEvent?.(event, i, e);
          const ms = skipping || reduced() ? 0 : Math.max(0, durationFor?.(event) ?? 0);
          if (ms > 0) await hold(ms, phase => onTick?.(event, phase));
          if (alive()) { onTick?.(event, 1); onEventEnd?.(event); }
        }
        if (!alive()) break;
        // a frame with nothing to show still gets a beat unless skipping or reduced
        if (!events.length && !skipping && !reduced()) await hold(frameBeat);
      }
      const finished = alive(); if (finished) { wake = null; skipping = false; }
      return { finished };
    }
  };
  return api;
}
