import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { checkPrivacyManifest, parsePlist, declaredApis, scanSource } from '../src/index.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'rn-privacy-manifest-check.js');

function manifestXml(entries) {
  const dicts = entries.map(([type, reasons]) => `
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>${type}</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>${reasons.map((r) => `<string>${r}</string>`).join('')}</array>
    </dict>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>${dicts}
  </array>
</dict>
</plist>`;
}

/** Build a throwaway React Native-ish project. */
function project({ appManifest, packages = {}, appJson } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rnpm-'));
  fs.mkdirSync(path.join(root, 'ios', 'MyApp'), { recursive: true });
  if (appManifest) fs.writeFileSync(path.join(root, 'ios', 'MyApp', 'PrivacyInfo.xcprivacy'), manifestXml(appManifest));
  if (appJson) fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify(appJson));
  for (const [name, pkg] of Object.entries(packages)) {
    const dir = path.join(root, 'node_modules', name);
    fs.mkdirSync(path.join(dir, 'ios'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
    if (pkg.podspec !== false) fs.writeFileSync(path.join(dir, `${name.replace('/', '-')}.podspec`), 'Pod::Spec.new');
    for (const [file, src] of Object.entries(pkg.files ?? {})) fs.writeFileSync(path.join(dir, 'ios', file), src);
    if (pkg.manifest) fs.writeFileSync(path.join(dir, 'ios', 'PrivacyInfo.xcprivacy'), manifestXml(pkg.manifest));
  }
  return root;
}

const byCat = (r) => Object.fromEntries(r.categories.map((c) => [c.category.replace('NSPrivacyAccessedAPICategory', ''), c]));

test('plist: parses Apple-style XML with DOCTYPE and attributes', () => {
  const obj = parsePlist(manifestXml([['NSPrivacyAccessedAPICategoryUserDefaults', ['CA92.1']]]));
  assert.equal(obj.NSPrivacyTracking, false);
  assert.deepEqual([...declaredApis(obj)], [['NSPrivacyAccessedAPICategoryUserDefaults', ['CA92.1']]]);
});

test('scanner: finds real API uses and ignores comments and look-alikes', () => {
  const src = `
    NSUserDefaults *d = [NSUserDefaults standardUserDefaults];
    let up = ProcessInfo.processInfo.systemUptime
    // statfs("/", &buf);  commented out
    /* uint64_t t = mach_absolute_time(); */
    NSDate *taken = phAsset.creationDate;          // Photos, not a file timestamp
    NSDate *d2 = attrs[NSFileCreationDate];
    let c = try fm.attributesOfItem(atPath: p)[.creationDate]
    int s = status(x);                              // not stat()
    if (stat(path, &st) == 0) {}
  `;
  const hits = scanSource(src);
  const got = new Set(hits.map((h) => `${h.category.replace('NSPrivacyAccessedAPICategory', '')}:${h.symbol}`));
  assert.ok(got.has('UserDefaults:UserDefaults'));
  assert.ok(got.has('SystemBootTime:ProcessInfo.systemUptime'));
  assert.ok(got.has('FileTimestamp:NSFileCreationDate'));
  assert.ok(got.has('FileTimestamp:FileAttributeKey.creationDate'));
  assert.ok(got.has('FileTimestamp:stat()'));
  assert.ok(!got.has('DiskSpace:statfs()'), 'commented statfs must be ignored');
  assert.ok(!got.has('SystemBootTime:mach_absolute_time()'), 'block-commented call must be ignored');
  const creationLines = hits.filter((h) => h.symbol === 'FileAttributeKey.creationDate').map((h) => h.line);
  assert.deepEqual(creationLines, [8], 'phAsset.creationDate must not match');
});

test('flags a category used by a package but missing from the app manifest', () => {
  const root = project({
    appManifest: [['NSPrivacyAccessedAPICategoryUserDefaults', ['CA92.1']]],
    packages: {
      'react-native-timer-lib': { files: { 'Timer.m': 'uint64_t t = mach_absolute_time();' } },
      'react-native-prefs': { files: { 'Prefs.swift': 'UserDefaults.standard.set(1, forKey: "k")' } },
    },
  });
  const r = checkPrivacyManifest(root);
  const c = byCat(r);
  assert.equal(c.SystemBootTime.status, 'missing');
  assert.equal(c.SystemBootTime.usedBy[0].package, 'react-native-timer-lib@1.0.0');
  assert.equal(c.UserDefaults.status, 'ok');
  assert.equal(r.ok, false);
});

test('invalid reason codes and unknown categories fail', () => {
  const root = project({
    appManifest: [
      ['NSPrivacyAccessedAPICategoryUserDefaults', ['C617.1']], // file-timestamp code under user defaults
      ['NSPrivacyAccessedAPICategoryMadeUp', ['XXXX.1']],
    ],
    packages: { prefs: { files: { 'P.m': '[NSUserDefaults standardUserDefaults];' } } },
  });
  const r = checkPrivacyManifest(root);
  const c = byCat(r);
  assert.equal(c.UserDefaults.status, 'invalid');
  assert.deepEqual(c.UserDefaults.invalidReasons, ['C617.1']);
  assert.equal(c.MadeUp.status, 'invalid');
  assert.equal(r.ok, false);
});

test("a package's own privacy manifest counts as covered (with a warning)", () => {
  const root = project({
    appManifest: [],
    packages: {
      'sdk-with-manifest': {
        files: { 'D.m': 'attrs[NSFileSystemFreeSize];' },
        manifest: [['NSPrivacyAccessedAPICategoryDiskSpace', ['E174.1']]],
      },
    },
  });
  const r = checkPrivacyManifest(root);
  assert.equal(byCat(r).DiskSpace.status, 'covered-by-packages');
  assert.equal(r.ok, true);
});

test('packages without a podspec are not scanned; declared-but-unused is informational', () => {
  const root = project({
    appManifest: [['NSPrivacyAccessedAPICategoryActiveKeyboards', ['54BD.1']]],
    packages: { 'js-only': { podspec: false, files: { 'x.m': 'mach_absolute_time();' } } },
  });
  const r = checkPrivacyManifest(root);
  assert.equal(byCat(r).ActiveKeyboards.status, 'unused');
  assert.equal(byCat(r).SystemBootTime, undefined);
  assert.equal(r.ok, true);
});

test('reads Expo ios.privacyManifests from app.json', () => {
  const root = project({
    appJson: { expo: { ios: { privacyManifests: { NSPrivacyAccessedAPITypes: [
      { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
    ] } } } },
    packages: { prefs: { files: { 'P.m': '[NSUserDefaults standardUserDefaults];' } } },
  });
  fs.rmSync(path.join(root, 'ios'), { recursive: true });
  const r = checkPrivacyManifest(root);
  assert.match(r.manifest, /app\.json/);
  assert.equal(byCat(r).UserDefaults.status, 'ok');
});

test('CLI: exit codes, --json and --snippet', () => {
  const bad = project({ appManifest: [], packages: { t: { files: { 'T.m': 'mach_absolute_time();' } } } });
  const good = project({ appManifest: [['NSPrivacyAccessedAPICategorySystemBootTime', ['35F9.1']]], packages: { t: { files: { 'T.m': 'mach_absolute_time();' } } } });
  const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

  assert.equal(run(good).status, 0);
  const r = run(bad, '--snippet');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /MISSING\s+System boot time/);
  assert.match(r.stdout, /<string>NSPrivacyAccessedAPICategorySystemBootTime<\/string>/);
  assert.match(r.stdout, /<string>35F9\.1<\/string>/);
  assert.equal(JSON.parse(run(bad, '--json').stdout).summary.missing, 1);
  assert.equal(run(path.join(os.tmpdir(), 'definitely-missing-dir-xyz')).status, 2);
  assert.equal(run(good, '--nope').status, 2);
});
