// Compares API usage with what the app's privacy manifest declares.

import path from 'node:path';
import { CATEGORIES, CATEGORY_KEYS } from './apis.js';
import { scanProject } from './scan.js';

/**
 * @param {string} projectDir
 * @param {{manifest?: string, pods?: boolean}} [opts]
 */
export function checkPrivacyManifest(projectDir, opts = {}) {
  const root = path.resolve(projectDir);
  const { app, units } = scanProject(root, opts);
  const categories = [];

  for (const key of CATEGORY_KEYS) {
    const users = units.filter((u) => u.usage.has(key));
    const declaredReasons = app.declared.get(key);
    const declared = declaredReasons !== undefined;
    if (!users.length && !declared) continue;

    const usedBy = users.map((u) => {
      const ownManifest = u.manifests.find((m) => m.declared.has(key));
      const hits = u.usage.get(key);
      return {
        package: u.name,
        kind: u.kind,
        coveredByOwnManifest: Boolean(ownManifest),
        symbols: [...new Set(hits.map((h) => h.symbol))],
        locations: hits.map((h) => ({ file: path.relative(root, h.file), line: h.line, symbol: h.symbol })),
      };
    });

    const validCodes = Object.keys(CATEGORIES[key].reasons);
    const invalidReasons = (declaredReasons ?? []).filter((r) => !validCodes.includes(r));

    let status;
    if (declared && invalidReasons.length) status = 'invalid';
    else if (declared && declaredReasons.length === 0) status = 'invalid';
    else if (declared) status = users.length ? 'ok' : 'unused';
    else if (usedBy.every((u) => u.coveredByOwnManifest)) status = 'covered-by-packages';
    else status = 'missing';

    categories.push({
      category: key,
      label: CATEGORIES[key].label,
      status,
      declaredReasons: declaredReasons ?? null,
      invalidReasons,
      suggestedReason: CATEGORIES[key].suggested,
      usedBy,
    });
  }

  // Unknown category strings in the app manifest.
  for (const key of app.declared.keys()) {
    if (!CATEGORIES[key]) {
      categories.push({ category: key, label: key, status: 'invalid', declaredReasons: app.declared.get(key), invalidReasons: [], unknownCategory: true, usedBy: [] });
    }
  }

  const failing = categories.filter((c) => c.status === 'missing' || c.status === 'invalid');
  return {
    project: root,
    manifest: app.source,
    summary: {
      categoriesUsed: categories.filter((c) => c.usedBy.length).length,
      ok: categories.filter((c) => c.status === 'ok').length,
      missing: categories.filter((c) => c.status === 'missing').length,
      invalid: categories.filter((c) => c.status === 'invalid').length,
      coveredByPackages: categories.filter((c) => c.status === 'covered-by-packages').length,
      unused: categories.filter((c) => c.status === 'unused').length,
      packagesScanned: units.length,
    },
    ok: failing.length === 0,
    categories,
  };
}
