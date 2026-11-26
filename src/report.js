import { CATEGORIES } from './apis.js';

const useColor = () => process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const red = paint(31);
const green = paint(32);
const yellow = paint(33);
const dim = paint(2);
const bold = paint(1);

const TAG = {
  ok: () => green('✔ DECLARED'),
  missing: () => red('✖ MISSING '),
  invalid: () => red('✖ INVALID '),
  'covered-by-packages': () => yellow('! PACKAGES'),
  unused: () => dim('– UNUSED  '),
};

function usedByLine(c, verbose) {
  const out = [];
  for (const u of c.usedBy) {
    const cov = u.coveredByOwnManifest ? dim(' (declared in its own manifest)') : '';
    out.push(`        used by: ${u.package}${cov} — ${u.symbols.join(', ')}`);
    if (verbose) for (const l of u.locations.slice(0, 20)) out.push(dim(`                 ${l.file}:${l.line}  ${l.symbol}`));
  }
  return out;
}

export function printReport(result, { verbose = false } = {}) {
  const out = [];
  out.push(`${bold('rn-privacy-manifest-check')} ${dim(`· ${result.project}`)}`);
  out.push(dim(`manifest: ${result.manifest ?? 'none found (ios/<App>/PrivacyInfo.xcprivacy or expo.ios.privacyManifests)'}`));
  out.push('');

  if (!result.categories.length) {
    out.push(green('✔ No required reason API usage found in native iOS code.'));
    console.log(out.join('\n'));
    return;
  }

  const order = { missing: 0, invalid: 1, 'covered-by-packages': 2, ok: 3, unused: 4 };
  for (const c of [...result.categories].sort((a, b) => order[a.status] - order[b.status])) {
    out.push(`${TAG[c.status]()}  ${bold(c.label)} ${dim(c.category)}`);
    if (c.declaredReasons) out.push(`        declared reasons: ${c.declaredReasons.join(', ') || red('(none)')}`);
    if (c.unknownCategory) out.push(red('        not a valid NSPrivacyAccessedAPIType'));
    if (c.invalidReasons?.length) {
      out.push(red(`        not valid for this category: ${c.invalidReasons.join(', ')}`));
      out.push(`        valid codes: ${Object.keys(CATEGORIES[c.category].reasons).join(', ')}`);
    }
    out.push(...usedByLine(c, verbose));
    if (c.status === 'missing') {
      const def = CATEGORIES[c.category];
      out.push(`        fix:  add ${c.category} with a reason that matches your use, e.g. ${bold(def.suggested)}`);
      out.push(dim(`              ${def.suggested}: ${def.reasons[def.suggested]}`));
    }
    if (c.status === 'covered-by-packages') {
      out.push(dim('        each package declares it in its own manifest — make sure those manifests are bundled into your app'));
      out.push(dim('        (or add the category to your app manifest to be safe)'));
    }
    if (c.status === 'unused') out.push(dim('        declared, but no usage found in scanned native code'));
    out.push('');
  }

  const s = result.summary;
  if (result.ok) {
    out.push(green(`✔ Every required reason API category in use is covered (${s.packagesScanned} native packages scanned).`));
  } else {
    const parts = [];
    if (s.missing) parts.push(`${s.missing} missing`);
    if (s.invalid) parts.push(`${s.invalid} invalid`);
    out.push(red(`✖ Privacy manifest needs changes: ${parts.join(', ')} (${s.packagesScanned} native packages scanned).`));
  }
  if (!verbose) out.push(dim('Run with --verbose to see file and line for each API use.'));
  console.log(out.join('\n'));
}

/** XML snippet with the missing categories, ready to paste into PrivacyInfo.xcprivacy. */
export function snippet(result) {
  const missing = result.categories.filter((c) => c.status === 'missing');
  if (!missing.length) return '';
  const dicts = missing.map((c) => `\t\t<dict>
\t\t\t<key>NSPrivacyAccessedAPIType</key>
\t\t\t<string>${c.category}</string>
\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>
\t\t\t<array>
\t\t\t\t<string>${c.suggestedReason}</string>
\t\t\t</array>
\t\t</dict>`).join('\n');
  return `<!-- Add inside the NSPrivacyAccessedAPITypes <array> of your PrivacyInfo.xcprivacy.
     Check each reason code matches how your app uses the API. -->
${dicts}`;
}
