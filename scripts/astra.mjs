#!/usr/bin/env node
// ---------------------------------------------------------------------------
//  Distant Sectors - the Astra link.  See docs/astra-link.md
//
//    node scripts/astra.mjs ask "message"      send to the standing thread
//    node scripts/astra.mjs ask --file brief.md [--write] [--repo DIR]
//    node scripts/astra.mjs new "message"      start a fresh thread, record it
//    node scripts/astra.mjs inbox [--mark]     what Astra has left for us
//    node scripts/astra.mjs thread [set ID]    show or set the standing thread
//
//  Every message either way is archived under the shared link folder, which
//  lives OUTSIDE the repo so all worktrees and both agents see the same one.
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LINK = process.env.DS_LINK_DIR || path.join(os.homedir(), 'Documents', 'ds-link');
const INBOX = path.join(LINK, 'astra-to-fable');
const OUTBOX = path.join(LINK, 'fable-to-astra');
const LOGS = path.join(LINK, 'logs');
const THREAD_FILE = path.join(LINK, 'thread.json');
const SEEN_FILE = path.join(LINK, 'seen.json');

const MODEL = process.env.DS_ASTRA_MODEL || 'gpt-6-astra';
// Medium by default since 2026-09-11: Chris reports visual evidence from r/aigamedev that medium
// effort yields results as good as high or xhigh on Astra, at a fraction of the time and cost.
// Raise per call with DS_ASTRA_EFFORT=high|xhigh when a job really is reasoning-bound.
const EFFORT = process.env.DS_ASTRA_EFFORT || 'medium';
// Node refuses to spawn a .cmd shim without a shell, and the shell would mangle
// the TOML in our -c arguments. The npm package is a plain node script, so run
// that directly when we can find it.
function resolveCodex() {
  const candidates = [
    process.env.DS_CODEX_JS,
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
    path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
  ].filter(Boolean);
  for (const js of candidates) {
    if (fs.existsSync(js)) return { cmd: process.execPath, prefix: [js] };
  }
  return { cmd: process.platform === 'win32' ? 'codex.cmd' : 'codex', prefix: [], shell: process.platform === 'win32' };
}

const CODEX = resolveCodex();

function ensure() {
  for (const dir of [LINK, INBOX, OUTBOX, LOGS]) fs.mkdirSync(dir, { recursive: true });
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function thread() {
  return readJSON(THREAD_FILE, null);
}

function saveThread(record) {
  fs.writeFileSync(THREAD_FILE, JSON.stringify(record, null, 2) + '\n');
}

// --- argument parsing -------------------------------------------------------

function parse(argv) {
  const opts = { write: false, repo: process.cwd(), file: null, mark: false, words: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--write') opts.write = true;
    else if (arg === '--mark') opts.mark = true;
    else if (arg === '--file') opts.file = argv[++i];
    else if (arg === '--repo') opts.repo = argv[++i];
    else opts.words.push(arg);
  }
  return opts;
}

function bodyOf(opts) {
  if (opts.file) return fs.readFileSync(opts.file, 'utf8');
  return opts.words.join(' ');
}

// --- the call itself --------------------------------------------------------

function callAstra(body, opts, fresh) {
  const mark = stamp();
  const sandbox = opts.write ? 'workspace-write' : 'read-only';
  const replyPath = path.join(INBOX, `${mark}-astra.md`);
  const logPath = path.join(LOGS, `${mark}.log`);
  const rawPath = path.join(LOGS, `${mark}-reply.txt`);

  const sent = path.join(OUTBOX, `${mark}-fable.md`);
  fs.writeFileSync(sent, header('Fable', 'Astra', mark, { sandbox, repo: opts.repo }) + body + '\n');

  const common = [
    '-m', MODEL,
    '-c', `model_reasoning_effort=${EFFORT}`,
    '-c', `sandbox_mode="${sandbox}"`,
    '--skip-git-repo-check',
    '-o', rawPath,
  ];

  // Under workspace-write the sandbox root is the repo, so the link folder has
  // to be named explicitly or Astra cannot post into astra-to-fable.
  if (opts.write) {
    const root = LINK.replace(/\\/g, '/');
    common.push('-c', `sandbox_workspace_write.writable_roots=["${root}"]`);
  }

  const standing = thread();
  const args = fresh || !standing
    ? ['exec', '-C', opts.repo, ...common, '--json', body]
    : ['exec', 'resume', standing.id, ...common, body];

  process.stderr.write(`> astra ${fresh || !standing ? 'new thread' : standing.id} (${sandbox}, ${EFFORT})\n`);
  const run = spawnSync(CODEX.cmd, [...CODEX.prefix, ...args], {
    cwd: opts.repo,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: CODEX.shell || false,
    maxBuffer: 64 * 1024 * 1024,
  });

  const log = (run.stdout || '') + (run.stderr || '') + (run.error ? `\n${run.error.stack}\n` : '');
  fs.writeFileSync(logPath, log);

  if (run.status !== 0) {
    process.stderr.write(log.split('\n').slice(-20).join('\n') + '\n');
    process.stderr.write(`\ncodex exited ${run.status}. Full log: ${logPath}\n`);
    process.exit(run.status || 1);
  }

  if (fresh || !standing) {
    const found = /"thread_id"\s*:\s*"([0-9a-f-]{36})"/.exec(log);
    if (found) {
      saveThread({ id: found[1], model: MODEL, opened: new Date().toISOString(), repo: opts.repo });
      process.stderr.write(`> standing thread is now ${found[1]}\n`);
    } else {
      process.stderr.write('> WARNING: could not read a thread id out of the run log\n');
    }
  }

  const reply = fs.existsSync(rawPath) ? fs.readFileSync(rawPath, 'utf8') : '(no reply captured)';
  fs.writeFileSync(replyPath, header('Astra', 'Fable', mark, { inReplyTo: path.basename(sent) }) + reply + '\n');
  markSeen([path.basename(replyPath)]);

  process.stdout.write(reply.trimEnd() + '\n');
  process.stderr.write(`\n> archived: ${replyPath}\n`);
}

function header(from, to, mark, extra = {}) {
  const lines = ['---', `from: ${from}`, `to: ${to}`, `sent: ${mark}`];
  for (const [key, value] of Object.entries(extra)) lines.push(`${key}: ${value}`);
  lines.push('---', '');
  return lines.join('\n');
}

// --- inbox ------------------------------------------------------------------

function markSeen(names) {
  const seen = readJSON(SEEN_FILE, []);
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...new Set([...seen, ...names])].sort(), null, 2) + '\n');
}

function inbox(opts) {
  const seen = new Set(readJSON(SEEN_FILE, []));
  const all = fs.existsSync(INBOX) ? fs.readdirSync(INBOX).filter((n) => n.endsWith('.md')).sort() : [];
  const unread = all.filter((n) => !seen.has(n));

  if (unread.length === 0) {
    process.stdout.write(`No unread messages from Astra. ${all.length} in the archive: ${INBOX}\n`);
    return;
  }
  for (const name of unread) {
    process.stdout.write(`\n===== ${name} =====\n`);
    process.stdout.write(fs.readFileSync(path.join(INBOX, name), 'utf8').trimEnd() + '\n');
  }
  if (opts.mark) {
    markSeen(unread);
    process.stderr.write(`\n> ${unread.length} marked read\n`);
  } else {
    process.stderr.write(`\n> ${unread.length} unread. Run with --mark to clear them.\n`);
  }
}

// --- entry ------------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);
const opts = parse(rest);
ensure();

switch (command) {
  case 'ask':
    callAstra(bodyOf(opts), opts, false);
    break;
  case 'new':
    callAstra(bodyOf(opts), opts, true);
    break;
  case 'inbox':
    inbox(opts);
    break;
  case 'thread': {
    if (opts.words[0] === 'set' && opts.words[1]) {
      saveThread({ id: opts.words[1], model: MODEL, opened: new Date().toISOString(), repo: opts.repo });
    }
    const record = thread();
    process.stdout.write(record ? JSON.stringify(record, null, 2) + '\n' : 'No standing thread. Use: astra new "message"\n');
    break;
  }
  default:
    process.stdout.write(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 13).join('\n').replace(/^\/\/ ?/gm, '') + '\n');
}
