// Objective checks on a running Fleet Command console, plus the setup drive that
// gets one running. Loaded as a plain script (not a module) so that both the
// browser review sheet and the headless capture script can use the same code:
// the sheet includes it with <script src>, the capture script injects it with
// addScriptTag. One implementation, so the two can never disagree.
//
// Nothing here judges whether the console *reads* right. These only catch the
// failures that are true or false regardless of taste.
(function (global) {
  "use strict";

  // A select handed a value it has no option for goes silently empty, after which
  // the playfield refuses the setup with only "Invalid command setup" to show for
  // it. Say which control refused and what it actually offers.
  function pick(el, value, what) {
    el.value = value;
    if (el.value !== value) {
      const offered = [...el.options].map((o) => o.value).join(", ");
      throw new Error(`${what} has no option "${value}" (offers ${offered})`);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Starts a bundled scenario through the playfield's own setup form. There is no
  // deep link for a bundled scenario yet — `?scenario=` only flips the mode — so if
  // one ever lands, this function is the only place that needs to change.
  function startEngagement(doc, { scenario, seed = "", side = "A" }) {
    const mode = doc.querySelector("#setup-mode");
    const bundled = doc.querySelector("#bundled-scenario");
    const seedField = doc.querySelector("#command-seed");
    const sideField = doc.querySelector("#command-side");
    const begin = doc.querySelector("#begin");
    if (!mode || !bundled || !begin) throw new Error("setup controls not found");
    pick(mode, "bundled", "setup mode");
    pick(bundled, scenario, "bundled scenario");
    if (sideField) pick(sideField, side, "commanding side");
    if (seedField) seedField.value = seed;
    begin.click();
  }

  function scenarioList(doc) {
    const select = doc.querySelector("#bundled-scenario");
    return [...(select?.options ?? [])].map((o) => ({
      file: o.value,
      label: o.textContent.trim() || o.value
    }));
  }

  function elementName(el) {
    if (el.id) return `#${el.id}`;
    const cls = typeof el.className === "string" ? el.className : el.className?.baseVal;
    const first = cls?.trim().split(/\s+/)[0];
    return first ? `.${first}` : el.tagName.toLowerCase();
  }

  // The hex view pans, so its own contents legitimately extend past the frame.
  // Only unclipped chrome counts as off-screen.
  function isClipped(el) {
    for (let a = el.parentElement; a; a = a.parentElement) {
      if (/hidden|clip|auto|scroll/.test(getComputedStyle(a).overflowX)) return true;
    }
    return false;
  }

  function inspect(win, doc) {
    const findings = [];
    const setup = doc.querySelector("#trial-setup");
    const started = !!doc.querySelector("#contact-map") && (!setup || setup.hidden || setup.offsetParent === null);
    if (!started) {
      const refusal = doc.querySelector("#trial-status")?.textContent?.trim();
      findings.push({ level: "bad", text: refusal ? `did not start — ${refusal}` : "did not start — still on the setup screen" });
    }

    const root = doc.documentElement;
    const overX = root.scrollWidth - win.innerWidth;
    const overY = root.scrollHeight - win.innerHeight;
    if (overX > 1) findings.push({ level: "bad", text: `scrolls sideways by ${overX}px at ${win.innerWidth}px` });
    if (overY > 1) findings.push({ level: "warn", text: `taller than the viewport by ${overY}px at ${win.innerHeight}px` });

    let widest = 0;
    let culprit = "";
    for (const el of doc.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.right <= widest || isClipped(el)) continue;
      widest = r.right;
      culprit = elementName(el);
    }
    if (widest > win.innerWidth + 1) {
      findings.push({ level: "warn", text: `${culprit} reaches ${Math.round(widest)}px, past the ${win.innerWidth}px edge` });
    }

    return { started, findings };
  }

  function verdict(findings) {
    if (findings.some((f) => f.level === "bad")) return "fail";
    return findings.length ? "warn" : "pass";
  }

  global.DSVisualChecks = { startEngagement, scenarioList, inspect, verdict };
})(typeof window !== "undefined" ? window : globalThis);
