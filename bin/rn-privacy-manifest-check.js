#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPrivacyManifest } from '../src/check.js';
import { printReport, snippet } from '../src/report.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

const HELP = `rn-privacy-manifest-check ${version}
Find which React Native packages use Apple's "required reason" APIs and check
that your app's PrivacyInfo.xcprivacy declares them.

Usage
  npx rn-privacy-manifest-check [project-dir] [options]

Options
  --manifest <file>  Use this PrivacyInfo.xcprivacy instead of auto-detecting
  --no-pods          Don't scan ios/Pods (only npm packages with a .podspec)
  --verbose          Show file and line for every API use
  --snippet          Print XML for the missing categories, ready to paste
  --json             Print machine-readable JSON
  -v, --version      Print the version
  -h, --help         Show this help

Exit codes
  0  every category in use is declared (or covered by the packages' own manifests)
  1  a category is missing, or the manifest has invalid reason codes
  2  usage error

Run it after \`pod install\` so ios/Pods is included.`;

function parse(argv) {
  const o = { dir: undefined, manifest: undefined, pods: true, verbose: false, json: false, snippet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
    else if (a === '--json') o.json = true;
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--snippet') o.snippet = true;
    else if (a === '--no-pods') o.pods = false;
    else if (a === '--manifest') o.manifest = argv[++i];
    else if (a.startsWith('--manifest=')) o.manifest = a.slice(11);
    else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    else if (!o.dir) o.dir = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  return o;
}

let o;
try { o = parse(process.argv.slice(2)); } catch (err) {
  console.error(`${err.message}\n\nRun rn-privacy-manifest-check --help for usage.`);
  process.exit(2);
}
if (o.version) { console.log(version); process.exit(0); }
if (o.help) { console.log(HELP); process.exit(0); }

try {
  const dir = o.dir ?? process.cwd();
  if (!fs.existsSync(dir)) throw new Error(`Directory not found: ${dir}`);
  if (!fs.existsSync(path.join(dir, 'node_modules')) && !fs.existsSync(path.join(dir, 'ios'))) {
    throw new Error(`${path.resolve(dir)} doesn't look like a React Native project (no node_modules or ios folder)`);
  }
  const result = checkPrivacyManifest(dir, { manifest: o.manifest, pods: o.pods });
  if (o.json) console.log(JSON.stringify(result, null, 2));
  else {
    printReport(result, { verbose: o.verbose });
    if (o.snippet) { const s = snippet(result); if (s) console.log(`\n${s}`); }
  }
  process.exit(result.ok ? 0 : 1);
} catch (err) {
  console.error(`rn-privacy-manifest-check: ${err.message}`);
  process.exit(2);
}
