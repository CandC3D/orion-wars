// Chris edits the source registers; this file only parses them and applies Fable's mapping.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const CLASS_MAP = {
  EAR: {
    Monoceros: 'frigate', Victory: 'destroyer', Saturn: 'missile-destroyer',
    Acamar: 'light-cruiser', 'Yi Sun-sin': 'heavy-cruiser', Federation: 'battleship',
    Yamato: 'gunstar-battlecruiser'
  },
  KRE: {
    Sparrowhawk: 'frigate', Swift: 'destroyer', Ballista: 'missile-destroyer',
    Raptor: 'light-cruiser', Lightning: 'strike-cruiser', 'Star Knight': 'heavy-cruiser',
    'Star Lord': 'battleship', Starblade: 'carrier'
  },
  VRA: {
    Shard: 'frigate', Point: 'destroyer',
    Avalanche: 'missile-destroyer', // Fable's inference; VDD model designation still awaits Chris's ruling.
    Feldspar: 'light-cruiser', Crystal: 'heavy-cruiser', Cluster: 'battleship', Bastion: 'monitor'
  }
};

const ROLES = new Set(['FRIGATES', 'DESTROYERS', 'LIGHT CRUISERS', 'STRIKE CRUISERS',
  'HEAVY CRUISERS', 'BATTLESHIPS', 'GUNSTAR BATTLECRUISERS', 'CARRIERS', 'MONITORS']);
const PREFIXES = { EAR: 'EDS', KRE: 'IKS', VRA: 'TWS' };

export function parseRegister(text, faction, { source = faction, warn = console.warn } = {}) {
  const mapping = CLASS_MAP[faction];
  if (!mapping) throw new Error(`No class mapping for ${faction}`);
  const register = { prefix: '', prefixName: '', navy: '', classes: {} };
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let title = false, factionHeader = false, role = false, current = null;
  const fail = (line, message) => { throw new Error(`${source}:${line + 1}: ${message}`); };
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (/[^\x20-\x7e]/.test(line)) fail(i, 'Register must be plain ASCII');
    if (!title) {
      if (!line.endsWith(' Ship Names')) fail(i, 'Expected register title');
      title = true;
      continue;
    }
    if (/^(Prefix|Navy|Faction):/.test(line)) {
      if (role) fail(i, 'Header after role section');
      if (line.startsWith('Prefix:')) {
        const match = /^Prefix:\s+([A-Z]+)\s+\(([^()]+)\)$/.exec(line);
        if (!match || register.prefix) fail(i, 'Malformed or duplicate Prefix header');
        [, register.prefix, register.prefixName] = match;
        if (register.prefix !== PREFIXES[faction]) fail(i, `Expected prefix ${PREFIXES[faction]}`);
      } else if (line.startsWith('Navy:')) {
        if (register.navy || !line.slice(5).trim()) fail(i, 'Malformed or duplicate Navy header');
        register.navy = line.slice(5).trim();
      } else {
        if (factionHeader || !line.slice(8).trim()) fail(i, 'Malformed or duplicate Faction header');
        factionHeader = true;
      }
      continue;
    }
    // Roles organize the prose only. Even the mixed-case "Monitors" maps no engine hull.
    if (ROLES.has(line.toUpperCase())) { role = true; current = null; continue; }
    if (line.includes('*') || /\bClass$/i.test(line)) {
      // Accept both *Lightning* Class and the usual *Something Class* without editing the source.
      const heading = /^(.*?)\s+Class$/.exec(line.replaceAll('*', '').trim());
      const sourceClass = heading?.[1];
      if (!sourceClass || !Object.hasOwn(mapping, sourceClass)) fail(i, `Unrecognised class heading: ${line}`);
      if (!role) fail(i, 'Class heading before role section');
      const className = mapping[sourceClass];
      if (register.classes[className]) fail(i, `Duplicate class heading: ${sourceClass}`);
      current = register.classes[className] = { sourceClass, names: [] };
      continue;
    }
    if (!current) fail(i, `Expected a role or class heading, got: ${line}`);
    if (current.names.includes(line)) {
      warn(`${source}:${i + 1}: duplicate ${JSON.stringify(line)} in ${current.sourceClass}; keeping first position`);
    } else current.names.push(line);
  }
  if (!title || !register.prefix || !register.navy || !factionHeader) throw new Error(`${source}: incomplete header`);
  for (const [sourceClass, className] of Object.entries(mapping)) {
    if (!register.classes[className]?.names.length) throw new Error(`${source}: missing or empty ${sourceClass} Class`);
  }
  return register;
}

export function buildShipNames(repoRoot = root, { warn = console.warn } = {}) {
  const tuning = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/tactical-tuning.json'), 'utf8'));
  const registers = {};
  for (const faction of Object.keys(CLASS_MAP)) {
    const source = `data/source/${faction.toLowerCase()}-ship-names.txt`;
    const register = parseRegister(fs.readFileSync(path.join(repoRoot, source), 'utf8'), faction, { source, warn });
    const roster = tuning.rosters[faction];
    if (!Array.isArray(roster) || roster.length !== Object.keys(register.classes).length ||
      roster.some(className => !Object.hasOwn(register.classes, className))) {
      throw new Error(`${faction}: class mapping does not match data/tactical-tuning.json rosters`);
    }
    registers[faction] = register;
  }
  return {
    _comment: 'Generated from data/source/*.txt. Regenerate with node scripts/build-ship-names.mjs; edit the source lists, not this JSON. Engine class mappings are explicit in that script and checked against data/tactical-tuning.json rosters. Duplicate names within a class keep their first position. Zandrax has no source register yet and draws no vessel names.',
    registers
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = JSON.stringify(buildShipNames(), null, 2) + '\n';
  fs.writeFileSync(path.join(root, 'data/ship-names.json'), output);
  console.log('Built data/ship-names.json from the EAR, KRE and VRA source registers.');
}
