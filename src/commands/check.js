import { resolve, join } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { detectPackageManager, getLockfileName } from '../infra/pm-detect.js';
import { buildDependencyGraph } from '../analyzers/dep-graph.js';
import { detectPeerConflicts } from '../analyzers/peer-conflicts.js';

export async function checkCommand(options) {
  const projectPath = resolve(options.projectPath);
  const ci = options.ci;
  let exitCode = 0;
  const checks = [];

  console.log('\n🏥 dep-doctor check\n');

  // Check 1: package.json exists
  const pkgPath = join(projectPath, 'package.json');
  if (!existsSync(pkgPath)) {
    checks.push({ name: 'package.json', status: 'fail', message: 'Not found' });
    printChecks(checks);
    process.exit(1);
  }
  checks.push({ name: 'package.json', status: 'pass' });

  // Check 2: Lockfile exists and is in sync
  const pm = detectPackageManager(projectPath);
  const lockfile = getLockfileName(pm);
  const lockPath = join(projectPath, lockfile);

  if (!existsSync(lockPath)) {
    checks.push({ name: `${lockfile}`, status: 'fail', message: 'Lockfile missing — run install' });
    exitCode = 1;
  } else {
    // Check if lockfile is newer than package.json
    const pkgStat = statSync(pkgPath);
    const lockStat = statSync(lockPath);
    if (pkgStat.mtimeMs > lockStat.mtimeMs) {
      checks.push({ name: `${lockfile} sync`, status: 'warn', message: 'package.json is newer than lockfile — run install' });
      exitCode = ci ? 1 : exitCode;
    } else {
      checks.push({ name: `${lockfile} sync`, status: 'pass' });
    }
  }

  // Check 3: No peerDep conflicts
  try {
    const graph = buildDependencyGraph(projectPath);
    const conflicts = detectPeerConflicts(graph);
    if (conflicts.length) {
      checks.push({
        name: 'peerDependencies',
        status: 'warn',
        message: `${conflicts.length} conflict(s): ${conflicts.slice(0, 3).map(c => `${c.package}→${c.peerDep}`).join(', ')}`,
      });
      exitCode = ci ? 1 : exitCode;
    } else {
      checks.push({ name: 'peerDependencies', status: 'pass' });
    }
  } catch {
    checks.push({ name: 'peerDependencies', status: 'skip', message: 'Could not parse lockfile' });
  }

  // Check 4: No .env committed
  if (existsSync(join(projectPath, '.env'))) {
    const gitignore = existsSync(join(projectPath, '.gitignore'))
      ? readFileSync(join(projectPath, '.gitignore'), 'utf8')
      : '';
    if (!gitignore.includes('.env')) {
      checks.push({ name: '.env in .gitignore', status: 'fail', message: '.env exists but not in .gitignore' });
      exitCode = 1;
    } else {
      checks.push({ name: '.env in .gitignore', status: 'pass' });
    }
  }

  // Check 5: Node version
  let engines;
  try {
    engines = JSON.parse(readFileSync(pkgPath, 'utf8')).engines;
  } catch {
    engines = null;
  }
  if (engines?.node) {
    const current = process.version.slice(1);
    checks.push({ name: `Node version (${engines.node})`, status: 'info', message: `Running ${current}` });
  }

  printChecks(checks);

  if (ci && exitCode) {
    console.log('\n❌ CI check failed\n');
    process.exit(exitCode);
  } else if (exitCode) {
    console.log('\n⚠️  Some checks have warnings\n');
  } else {
    console.log('\n✅ All checks passed\n');
  }
}

function printChecks(checks) {
  const icons = { pass: '✅', fail: '❌', warn: '⚠️ ', skip: '⏭ ', info: 'ℹ️ ' };
  for (const check of checks) {
    const icon = icons[check.status] || '?';
    const msg = check.message ? ` — ${check.message}` : '';
    console.log(`  ${icon} ${check.name}${msg}`);
  }
}
