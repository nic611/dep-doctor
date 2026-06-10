import { resolve, join } from 'node:path';
import { scanCommand } from './scan.js';
import { STRATEGIES, RISK_LEVELS } from '../fixers/strategy-engine.js';
import { applySafeUpgrade } from '../fixers/safe-upgrade.js';
import { applyOverride, applyPeerDepOverride } from '../fixers/override-fixer.js';
import { generateAdapter } from '../fixers/adapter-generator.js';
import { generateForkPatchGuide } from '../fixers/fork-patch.js';
// import { runAllCodemods } from '../fixers/codemod-runner.js'; // TODO: wire up MAJOR_UPGRADE strategy group
import { generateMigrationGuide } from '../reporter/migration-guide.js';
import { isGitRepo, isGitClean, gitCheckoutFiles } from '../infra/git-state.js';
import { run } from '../infra/runner.js';
import { detectPackageManager, getInstallCommand, getRunTestCommand, getLockfileName } from '../infra/pm-detect.js';
import * as terminal from '../reporter/terminal.js';

export async function fixCommand(options) {
  const projectPath = resolve(options.projectPath);
  const dryRun = options.dryRun;
  const maxRisk = RISK_LEVELS[options.maxRisk] || RISK_LEVELS.medium;
  const forceStrategy = options.strategy;

  // Safety check: git state
  if (!dryRun && isGitRepo(projectPath) && !isGitClean(projectPath)) {
    console.log('\n⚠️  Working directory has uncommitted changes.');
    console.log('   Commit or stash changes before running fix.');
    console.log('   Or use --dry-run to preview changes.\n');
    process.exit(1);
  }

  // Step 1: Run scan to get the plan
  console.log('\n🔍 Scanning...\n');
  const scanResult = await scanCommand({ ...options, format: 'silent' });
  let { plan } = scanResult;

  // Filter by strategy if forced
  if (forceStrategy) {
    plan = plan.filter(p => p.strategy === forceStrategy);
  }

  // Filter by max risk
  plan = plan.filter(p => RISK_LEVELS[p.risk] <= maxRisk);

  if (!plan.length) {
    console.log('✅ No fixable issues found within risk threshold.\n');
    return;
  }

  terminal.printPlan(plan);

  if (dryRun) {
    console.log('🏃 Dry run — no changes applied.\n');
    // Generate migration guide even in dry-run
    const guidePath = join(projectPath, 'MIGRATION-GUIDE.md');
    generateMigrationGuide(scanResult, guidePath);
    console.log(`📝 Migration guide: ${guidePath}\n`);
    return;
  }

  // Step 2: Execute fixes by strategy groups
  const pm = detectPackageManager(projectPath);
  const results = { applied: [], failed: [], skipped: [] };

  // Group 1: Safe upgrades (patch + minor)
  const safeUpgrades = plan.filter(p => p.strategy === STRATEGIES.SAFE_UPGRADE && p.risk === 'low');
  if (safeUpgrades.length) {
    console.log('\n📦 Applying safe upgrades...');
    for (const action of safeUpgrades) {
      const target = action.steps.find(s => s.action === 'upgrade')?.target;
      if (!target) continue;

      const result = applySafeUpgrade(projectPath, action.package, target);
      if (result.success) {
        console.log(`   ✓ ${action.package} → ${target}`);
        results.applied.push(action);
      } else {
        console.log(`   ✗ ${action.package}: ${result.error}`);
        results.failed.push({ ...action, error: result.error });
      }
    }

    // Test after safe upgrades
    console.log('\n🧪 Running tests...');
    const testResult = run(getRunTestCommand(pm), projectPath, { silent: true });
    if (!testResult.success) {
      console.log('   ⚠️  Tests failed after safe upgrades. Rolling back...');
      gitCheckoutFiles(projectPath, ['package.json', getLockfileName(pm)]);
      run(getInstallCommand(pm), projectPath, { silent: true });
      results.applied = [];
      results.failed.push({ package: 'batch-safe-upgrade', error: 'Tests failed' });
    } else {
      console.log('   ✓ Tests passed');
    }
  }

  // Group 2: Overrides
  const overrides = plan.filter(p => p.strategy === STRATEGIES.OVERRIDE);
  if (overrides.length) {
    console.log('\n⚙️  Applying overrides...');
    for (const action of overrides) {
      const pc = action.steps.find(s => s.peerConflicts)?.peerConflicts?.[0];
      if (pc) {
        const result = applyPeerDepOverride(projectPath, action.package, pc.peerDep, pc.required);
        if (result.success) {
          console.log(`   ✓ Override: ${action.package} → ${pc.peerDep}`);
          results.applied.push(action);
        } else {
          console.log(`   ✗ Override failed: ${action.package} — ${result.error}`);
          results.failed.push({ ...action, error: result.error });
        }
      } else {
        const result = applyOverride(projectPath, action.package, 'latest');
        if (result.success) {
          console.log(`   ✓ Override: ${action.package}`);
          results.applied.push(action);
        } else {
          console.log(`   ✗ Override failed: ${action.package} — ${result.error}`);
          results.failed.push({ ...action, error: result.error });
        }
      }
    }
  }

  // Group 3: Adapters
  const adapters = plan.filter(p => p.strategy === STRATEGIES.ADAPTER);
  if (adapters.length) {
    console.log('\n🔌 Generating adapters...');
    const adapterDir = join(projectPath, 'src', 'adapters');
    for (const action of adapters) {
      const findings = scanResult.compatFindings.filter(f =>
        f.api.toLowerCase().includes(action.package.replace(/-/g, ''))
      );
      const result = generateAdapter(action.package, findings, adapterDir);
      if (result.success) {
        console.log(`   ✓ Adapter: ${action.package} (${result.shimCount} shims)`);
        console.log(`     Files: ${result.files.join(', ')}`);
        results.applied.push(action);
      } else {
        console.log(`   ✗ Adapter failed: ${action.package} — ${result.error}`);
        results.failed.push({ ...action, error: result.error });
      }
    }
  }

  // Group 4: Fork-patch guides
  const forkPatches = plan.filter(p => p.strategy === STRATEGIES.FORK_PATCH);
  if (forkPatches.length) {
    console.log('\n🍴 Generating fork-patch guides...');
    const guideDir = join(projectPath, 'docs', 'migration');
    for (const action of forkPatches) {
      const result = generateForkPatchGuide(action.package, scanResult.compatFindings, guideDir);
      if (result.success) {
        console.log(`   ✓ Guide: ${result.file}`);
        results.applied.push(action);
      } else {
        console.log(`   ✗ Guide failed: ${action.package} — ${result.error}`);
        results.failed.push({ ...action, error: result.error });
      }
    }
  }

  // Final: Generate migration guide
  const guidePath = join(projectPath, 'MIGRATION-GUIDE.md');
  generateMigrationGuide(scanResult, guidePath);

  // Summary
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`✅ Applied: ${results.applied.length}`);
  if (results.failed.length) console.log(`❌ Failed:  ${results.failed.length}`);
  if (results.skipped.length) console.log(`⏭  Skipped: ${results.skipped.length}`);
  console.log(`📝 Guide:   ${guidePath}\n`);
}
