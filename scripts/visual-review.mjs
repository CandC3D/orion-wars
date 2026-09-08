// Headless visual review: start every bundled scenario on the real engine, run the
// objective checks, capture a full-resolution screenshot of each, and write a contact
// sheet you can audition the whole set from in one sitting.
//
//   npm run review                      1440x900, seed review-1, commanding side A
//   npm run review -- --width 1920 --height 1080
//   npm run review -- --seed review-2 --side B
//   npm run review -- --out docs/visual-review/before
//
// Exit code is 1 if any scenario fails a check, so this can gate a commit. Warnings
// do not fail the run; they are things to look at, not things that are wrong.
//
// The checks themselves live in arena/visual-checks.js and are shared verbatim with
// the in-browser sheet at arena/visual-review.html, so the two cannot drift apart.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const width = Number(arg("width", 1440));
const height = Number(arg("height", 900));
const seed = arg("seed", "review-1");
const side = arg("side", "A").toUpperCase();
const outDir = resolve(root, arg("out", "docs/visual-review"));
const settleMs = Number(arg("settle", 1600));

// Serve the repo the same way `npm run arena` does, on an ephemeral port so this
// never collides with a server the user already has running.
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".glb": "model/gltf-binary" };

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      const ext = file.slice(file.lastIndexOf("."));
      res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

const { server, origin } = await serve();
const checks = await readFile(join(root, "arena", "visual-checks.js"), "utf8");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });

async function openConsole() {
  const page = await context.newPage();
  const thrown = [];
  page.on("pageerror", (e) => thrown.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") thrown.push(m.text()); });
  await page.goto(`${origin}/arena/play.html`, { waitUntil: "load" });
  // The scenario select is filled after the page fetches the tactical catalogue, so
  // `load` alone is too early to drive the form.
  await page.waitForFunction(() => document.querySelector("#bundled-scenario")?.options.length > 0, null, { timeout: 15000 });
  await page.addScriptTag({ content: checks });
  return { page, thrown };
}

// The scenario list comes from the playfield's own select, so this tracks whatever
// arena/scenarios/ actually holds rather than a list that goes stale here.
const probe = await openConsole();
await probe.page.waitForTimeout(500);
const scenarios = await probe.page.evaluate(() => window.DSVisualChecks.scenarioList(document));
await probe.page.close();

if (!scenarios.length) {
  console.error("No bundled scenarios found in the playfield's scenario list.");
  await browser.close(); server.close(); process.exit(1);
}

const results = [];
for (const entry of scenarios) {
  const { page, thrown } = await openConsole();
  let outcome;
  try {
    await page.evaluate(
      ([scenario, seedValue, sideValue]) => window.DSVisualChecks.startEngagement(document, { scenario, seed: seedValue, side: sideValue }),
      [entry.file, seed, side]
    );
    await page.waitForTimeout(settleMs);
    outcome = await page.evaluate(() => window.DSVisualChecks.inspect(window, document));
  } catch (error) {
    outcome = { started: false, findings: [{ level: "bad", text: `harness could not drive the page: ${error.message}` }] };
  }
  for (const message of thrown) outcome.findings.push({ level: "bad", text: `threw: ${message}` });

  const shot = `${entry.file.replace(/\.json$/, "")}.png`;
  await page.screenshot({ path: join(outDir, shot) });
  await page.close();

  const verdict = outcome.findings.some((f) => f.level === "bad") ? "fail" : outcome.findings.length ? "warn" : "pass";
  results.push({ ...entry, shot, verdict, findings: outcome.findings });
  const mark = verdict === "pass" ? "ok  " : verdict === "warn" ? "warn" : "FAIL";
  console.log(`${mark}  ${entry.label}`);
  for (const f of outcome.findings) console.log(`        ${f.text}`);
}

await browser.close();
server.close();

const failed = results.filter((r) => r.verdict === "fail").length;
const warned = results.filter((r) => r.verdict === "warn").length;
const run = { capturedAt: new Date().toISOString(), width, height, seed, side, results };
await writeFile(join(outDir, "review.json"), `${JSON.stringify(run, null, 2)}\n`);

const escape = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
await writeFile(join(outDir, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Visual review — ${escape(width)}×${escape(height)}</title>
<style>
:root{--ground:#0b1016;--panel:#111923;--edge:#1e2a37;--ink:#dbe4ee;--muted:#7f8ea0;--ok:#4fae7a;--warn:#d8a13c;--bad:#e0614f}
*{box-sizing:border-box}body{margin:0;background:var(--ground);color:var(--ink);font:13px/1.5 ui-monospace,Consolas,monospace}
header{padding:16px 20px;border-bottom:1px solid var(--edge);display:flex;gap:20px;align-items:baseline;flex-wrap:wrap}
h1{font-size:14px;letter-spacing:.16em;text-transform:uppercase;margin:0}
.meta{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(560px,1fr));gap:20px;padding:20px}
figure{margin:0;background:var(--panel);border:1px solid var(--edge);border-radius:4px;overflow:hidden}
figcaption{display:flex;gap:10px;align-items:center;padding:9px 12px;border-bottom:1px solid var(--edge)}
.name{font-weight:600}
.chip{font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border-radius:2px;border:1px solid currentColor}
.pass{color:var(--ok)}.warn{color:var(--warn)}.fail{color:var(--bad)}
img{display:block;width:100%;height:auto;background:#05090d}
ul{margin:0;padding:9px 12px 9px 28px;color:var(--warn);font-size:11.5px;border-top:1px solid var(--edge)}
li.bad{color:var(--bad)}
p.clean{margin:0;padding:9px 12px;border-top:1px solid var(--edge);color:var(--ok);font-size:11.5px}
</style></head><body>
<header><h1>Visual review</h1>
<span class="meta">${escape(width)}×${escape(height)} · seed ${escape(seed)} · side ${escape(side)} · ${escape(new Date().toLocaleString())}</span>
<span class="meta">${results.length} scenarios · <span class="fail">${failed} failing</span> · <span class="warn">${warned} to look at</span></span>
</header>
<div class="grid">
${results.map((r) => `<figure>
  <figcaption><span class="name">${escape(r.label)}</span><span class="chip ${r.verdict}">${r.verdict === "pass" ? "clean" : r.verdict === "warn" ? `${r.findings.length} to look at` : "failing"}</span></figcaption>
  <a href="${escape(r.shot)}"><img src="${escape(r.shot)}" alt="${escape(r.label)} at ${escape(width)}×${escape(height)}" loading="lazy"></a>
  ${r.findings.length ? `<ul>${r.findings.map((f) => `<li class="${f.level === "bad" ? "bad" : "warn"}">${escape(f.text)}</li>`).join("")}</ul>` : `<p class="clean">Started, fits the viewport, nothing thrown.</p>`}
</figure>`).join("\n")}
</div>
<p class="meta" style="padding:0 20px 40px">The checks are objective only. Whether the console reads right is what the pictures are for.</p>
</body></html>
`);

console.log(`\n${results.length} scenarios at ${width}×${height}, seed ${seed}, side ${side}`);
console.log(`${failed} failing, ${warned} with warnings`);
console.log(`Contact sheet: ${join(outDir, "index.html")}`);
process.exit(failed ? 1 : 0);
