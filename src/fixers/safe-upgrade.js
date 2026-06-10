import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../infra/runner.js';
import { detectPackageManager, getInstallCommand } from '../infra/pm-detect.js';

export function applySafeUpgrade(projectPath, packageName, targetVersion, { dryRun = false } = {}) {
  const pkgJsonPath = join(projectPath, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const pm = detectPackageManager(projectPath);

  // Find the package in deps or devDeps
  let depType = null;
  let currentRange = null;

  if (pkg.dependencies?.[packageName]) {
    depType = 'dependencies';
    currentRange = pkg.dependencies[packageName];
  } else if (pkg.devDependencies?.[packageName]) {
    depType = 'devDependencies';
    currentRange = pkg.devDependencies[packageName];
  }

  if (!depType) {
    return { success: false, error: `${packageName} not found in dependencies or devDependencies` };
  }

  // Preserve range prefix (^, ~, etc.)
  const prefix = currentRange.match(/^([~^>=<\s]*)/)?.[1] || '^';
  const newRange = `${prefix}${targetVersion}`;

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      change: { package: packageName, from: currentRange, to: newRange, depType },
    };
  }

  // Apply change
  pkg[depType][packageName] = newRange;
  writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');

  // Run install
  const installResult = run(getInstallCommand(pm), projectPath, { silent: true });
  if (!installResult.success) {
    // Rollback
    pkg[depType][packageName] = currentRange;
    writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    return { success: false, error: `Install failed after upgrading ${packageName}`, installError: installResult.error };
  }

  return {
    success: true,
    change: { package: packageName, from: currentRange, to: newRange, depType },
  };
}

export function applyBatchUpgrade(projectPath, upgrades, { dryRun = false } = {}) {
  const results = [];
  for (const { name, targetVersion } of upgrades) {
    const result = applySafeUpgrade(projectPath, name, targetVersion, { dryRun });
    results.push({ ...result, package: name });
    if (!result.success && !dryRun) {
      console.warn(`⚠️  Stopping batch: ${name} upgrade failed`);
      break;
    }
  }
  return results;
}
