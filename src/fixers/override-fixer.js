import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectPackageManager } from '../infra/pm-detect.js';

export function applyOverride(projectPath, packageName, overrideVersion, { dryRun = false } = {}) {
  const pkgJsonPath = join(projectPath, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  } catch (err) {
    return { success: false, error: `Cannot read package.json: ${err.message}` };
  }
  const pm = detectPackageManager(projectPath);

  let overrideKey, overridePath;

  if (pm === 'pnpm') {
    // pnpm uses pnpm.overrides
    overrideKey = 'pnpm';
    if (!pkg.pnpm) pkg.pnpm = {};
    if (!pkg.pnpm.overrides) pkg.pnpm.overrides = {};
    overridePath = pkg.pnpm.overrides;
  } else {
    // npm uses overrides (npm 8.3+)
    if (!pkg.overrides) pkg.overrides = {};
    overridePath = pkg.overrides;
    overrideKey = 'overrides';
  }

  const previousValue = overridePath[packageName];

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      change: {
        field: pm === 'pnpm' ? 'pnpm.overrides' : 'overrides',
        package: packageName,
        value: overrideVersion,
        previousValue: previousValue || null,
      },
    };
  }

  overridePath[packageName] = overrideVersion;
  writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');

  return {
    success: true,
    change: {
      field: pm === 'pnpm' ? 'pnpm.overrides' : 'overrides',
      package: packageName,
      value: overrideVersion,
      previousValue: previousValue || null,
    },
  };
}

export function applyPeerDepOverride(projectPath, blockerPackage, peerDep, overrideVersion, { dryRun = false } = {}) {
  // For nested overrides: override a transitive dep's specific dependency
  const pkgJsonPath = join(projectPath, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  } catch (err) {
    return { success: false, error: `Cannot read package.json: ${err.message}` };
  }
  const pm = detectPackageManager(projectPath);

  if (pm === 'pnpm') {
    // pnpm: pnpm.overrides[peerDep] = overrideVersion (global override)
    if (!pkg.pnpm) pkg.pnpm = {};
    if (!pkg.pnpm.overrides) pkg.pnpm.overrides = {};

    if (dryRun) {
      return { success: true, dryRun: true, change: { field: 'pnpm.overrides', package: peerDep, value: overrideVersion } };
    }

    pkg.pnpm.overrides[peerDep] = overrideVersion;
  } else {
    // npm: overrides[blockerPackage][peerDep] = overrideVersion (scoped override)
    if (!pkg.overrides) pkg.overrides = {};
    if (!pkg.overrides[blockerPackage]) pkg.overrides[blockerPackage] = {};

    if (dryRun) {
      return { success: true, dryRun: true, change: { field: `overrides.${blockerPackage}`, package: peerDep, value: overrideVersion } };
    }

    pkg.overrides[blockerPackage][peerDep] = overrideVersion;
  }

  writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  return { success: true, change: { blocker: blockerPackage, peerDep, overrideVersion } };
}
