// Finds required-reason API usage in a React Native project's native iOS code
// (npm packages with a .podspec, plus CocoaPods in ios/Pods), and the privacy
// manifests that cover it.

import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from './apis.js';
import { parsePlist, declaredApis } from './plist.js';

const SOURCE_EXT = new Set(['.m', '.mm', '.swift', '.h', '.hpp', '.c', '.cc', '.cpp']);
const SKIP_DIRS = new Set([
  'node_modules', 'android', 'build', '.git', '.gradle', 'example', 'examples', 'Example',
  'test', 'tests', '__tests__', 'Tests', 'docs', 'website', 'fixtures',
]);

/** Remove // and /* *\/ comments while keeping line numbers. */
export function stripComments(src) {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === '"' || c === '\n') inStr = false;
      i++;
    } else if (c === '"') {
      inStr = true; out += c; i++;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; }
      i += 2;
    } else {
      out += c; i++;
    }
  }
  return out;
}

/** Scan one source file. Returns [{category, symbol, line}]. */
export function scanSource(text) {
  const hits = [];
  const lines = stripComments(text).split('\n');
  lines.forEach((line, idx) => {
    for (const [category, def] of Object.entries(CATEGORIES)) {
      for (const [re, symbol] of def.patterns) {
        if (re.test(line)) hits.push({ category, symbol, line: idx + 1 });
      }
    }
  });
  return hits;
}

function walk(dir, onFile) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(full); }
      else if (e.isFile()) onFile(full, e.name);
    }
  }
}

function readManifest(file) {
  try { return declaredApis(parsePlist(fs.readFileSync(file, 'utf8'))); } catch { return null; }
}

/** Scan a package/pod directory for API usage and its own privacy manifests. */
function scanUnit(dir) {
  const usage = new Map(); // category -> [{file, line, symbol}]
  const manifests = [];
  walk(dir, (full, name) => {
    if (name === 'PrivacyInfo.xcprivacy') {
      const declared = readManifest(full);
      if (declared) manifests.push({ file: full, declared });
      return;
    }
    if (!SOURCE_EXT.has(path.extname(name))) return;
    let text;
    try { text = fs.readFileSync(full, 'utf8'); } catch { return; }
    for (const hit of scanSource(text)) {
      if (!usage.has(hit.category)) usage.set(hit.category, []);
      usage.get(hit.category).push({ file: full, line: hit.line, symbol: hit.symbol });
    }
  });
  return { usage, manifests };
}

function hasPodspec(dir) {
  try { return fs.readdirSync(dir).some((f) => f.endsWith('.podspec')); } catch { return false; }
}

function listPackages(nodeModules) {
  const out = [];
  let names;
  try { names = fs.readdirSync(nodeModules); } catch { return out; }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const dir = path.join(nodeModules, name);
    if (name.startsWith('@')) {
      for (const sub of fs.readdirSync(dir)) out.push(path.join(dir, sub));
    } else {
      out.push(dir);
    }
  }
  return out;
}

function pkgLabel(dir) {
  try {
    const { name, version } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return version ? `${name}@${version}` : name;
  } catch {
    return path.basename(dir);
  }
}

/** Locate the app's own privacy manifest (or Expo config). */
export function findAppManifest(projectDir, override) {
  if (override) {
    const declared = readManifest(override);
    if (!declared) throw new Error(`Could not read privacy manifest: ${override}`);
    return { source: override, declared };
  }
  const iosDir = path.join(projectDir, 'ios');
  if (fs.existsSync(iosDir)) {
    for (const ent of fs.readdirSync(iosDir, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name === 'Pods' || ent.name === 'build') continue;
      const f = path.join(iosDir, ent.name, 'PrivacyInfo.xcprivacy');
      if (fs.existsSync(f)) return { source: f, declared: readManifest(f) ?? new Map() };
    }
  }
  // Expo: ios.privacyManifests in app.json
  for (const cfg of ['app.json', 'app.config.json']) {
    const f = path.join(projectDir, cfg);
    if (!fs.existsSync(f)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(f, 'utf8'));
      const pm = (json.expo ?? json).ios?.privacyManifests;
      if (pm) return { source: `${cfg} (expo.ios.privacyManifests)`, declared: declaredApis(pm) };
    } catch { /* ignore */ }
  }
  return { source: null, declared: new Map() };
}

/**
 * Scan a project.
 * @param {string} projectDir
 * @param {{manifest?: string, pods?: boolean}} [opts]
 */
export function scanProject(projectDir, opts = {}) {
  const units = [];
  for (const dir of listPackages(path.join(projectDir, 'node_modules'))) {
    if (!hasPodspec(dir)) continue;
    const { usage, manifests } = scanUnit(dir);
    if (usage.size || manifests.length) units.push({ name: pkgLabel(dir), kind: 'npm', dir, usage, manifests });
  }
  const podsDir = path.join(projectDir, 'ios', 'Pods');
  if (opts.pods !== false && fs.existsSync(podsDir)) {
    for (const ent of fs.readdirSync(podsDir, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name === 'Headers' || ent.name.endsWith('.xcodeproj') || ent.name === 'Target Support Files' || ent.name === 'Local Podspecs') continue;
      const dir = path.join(podsDir, ent.name);
      const { usage, manifests } = scanUnit(dir);
      if (usage.size || manifests.length) units.push({ name: `${ent.name} (pod)`, kind: 'pod', dir, usage, manifests });
    }
  }
  return { app: findAppManifest(projectDir, opts.manifest), units };
}
