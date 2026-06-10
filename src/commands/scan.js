import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { detectPackageManager } from '../infra/pm-detect.js';
import { fetchPackageInfo, classifyUpgrade } from '../infra/registry.js';
import { buildDependencyGraph } from '../analyzers/dep-graph.js';
import { detectPeerConflicts } from '../analyzers/peer-conflicts.js';
import { parseVulnReport, groupVulnsByPackage, getHighestSeverity } from '../analyzers/vuln-parser.js';
import { checkCompatibility, summarizeFindings } from '../analyzers/compat-checker.js';
import { generatePlan } from '../fixers/strategy-engine.js';
import * as terminal from '../reporter/terminal.js';
import { formatAsJson } from '../reporter/json-reporter.js';

export async function scanCommand(options) {
  const projectPath = resolve(options.projectPath);
  const pkgJsonPath = join(projectPath, 'package.json');

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  } catch {
    throw new Error(`Cannot read package.json at ${pkgJsonPath}`);
  }

  const pm = detectPackageManager(projectPath);
  const projectName = pkg.name || 'unnamed';

  if (options.format === 'terminal') {
    terminal.printScanHeader(projectName);
    console.log(`  Package manager: ${pm}`);
    console.log(`  Node: ${process.version}`);
    console.log('');
  }

  // Step 1: Build dependency graph
  const graph = buildDependencyGraph(projectPath);

  // Step 2: Check outdated packages
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const outdated = [];

  if (options.format === 'terminal') {
    process.stdout.write('  Checking registry');
  }

  const CONCURRENCY = 10;
  const entries = Object.entries(allDeps);
  const skipped = [];

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async ([name, range]) => {
        const info = await fetchPackageInfo(name);
        const currentVersion = range.replace(/^[\^~>=<\s]+/, '');

        if (options.format === 'terminal') process.stdout.write('.');

        const upgradeType = classifyUpgrade(currentVersion, info.latestVersion);
        if (upgradeType !== 'current') {
          return {
            name,
            current: currentVersion,
            latest: info.latestVersion,
            upgradeType,
            lastPublish: info.lastPublish,
            deprecated: info.deprecated,
            peerDependencies: info.peerDependencies,
          };
        }
        return null;
      })
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled' && r.value) {
        outdated.push(r.value);
      } else if (r.status === 'rejected') {
        skipped.push(batch[j][0]);
      }
    }
  }

  if (skipped.length && options.format === 'terminal') {
    console.log(`\n  ⚠️  Skipped ${skipped.length} packages (private/unreachable): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '...' : ''}`);
  }

  if (options.format === 'terminal') console.log(' done\n');

  // Step 3: Parse vulnerabilities
  const vulnerabilities = options.vulnReport ? parseVulnReport(options.vulnReport) : [];

  // Step 4: Detect peer conflicts
  const peerConflicts = detectPeerConflicts(graph);

  // Step 5: Check code compatibility
  const compatFindings = checkCompatibility(projectPath);
  const compatSummary = summarizeFindings(compatFindings);

  // Step 6: Generate fix plan
  const issues = buildIssuesList(outdated, vulnerabilities, peerConflicts, compatFindings);
  const plan = generatePlan(issues);

  // Summary stats
  const summary = {
    total: Object.keys(allDeps).length,
    outdated: outdated.length,
    vulnerable: vulnerabilities.length,
    peerConflicts: peerConflicts.length,
    compatIssues: compatFindings.length,
    estimatedHours: compatSummary.estimatedHours,
  };

  const result = { projectName, pm, summary, outdated, vulnerabilities, peerConflicts, compatFindings, compatSummary, plan };

  // Output
  if (options.format === 'json') {
    console.log(formatAsJson(result));
  } else if (options.format !== 'silent') {
    terminal.printDependencyTable(
      outdated.filter(d => d.upgradeType === 'major'),
      'Major Updates'
    );
    terminal.printDependencyTable(
      outdated.filter(d => d.upgradeType === 'minor'),
      'Minor Updates'
    );
    terminal.printDependencyTable(
      outdated.filter(d => d.upgradeType === 'patch'),
      'Patch Updates'
    );
    terminal.printVulnerabilities(vulnerabilities);
    terminal.printPeerConflicts(peerConflicts);
    terminal.printCompatIssues(compatFindings, compatSummary);
    terminal.printPlan(plan);
    terminal.printSummary(summary);
  }

  return result;
}

function buildIssuesList(outdated, vulnerabilities, peerConflicts, compatFindings) {
  const issues = [];
  const vulnByPkg = groupVulnsByPackage(vulnerabilities);
  const conflictByPkg = {};
  for (const c of peerConflicts) {
    if (!conflictByPkg[c.package]) conflictByPkg[c.package] = [];
    conflictByPkg[c.package].push(c);
  }

  // Merge all data per package
  const allPackages = new Set([
    ...outdated.map(d => d.name),
    ...Object.keys(vulnByPkg),
    ...Object.keys(conflictByPkg),
  ]);

  for (const name of allPackages) {
    const outdatedInfo = outdated.find(d => d.name === name);
    const pkgVulns = vulnByPkg[name] || [];
    const pkgConflicts = conflictByPkg[name] || [];
    const pkgCompat = compatFindings.filter(f =>
      f.api.toLowerCase().includes(name.replace(/-/g, '').toLowerCase()) ||
      (name === 'react' && f.api.includes('React')) ||
      (name === 'react-router-dom' && (f.api.includes('Switch') || f.api.includes('History') || f.api.includes('Redirect')))
    );

    issues.push({
      type: pkgVulns.length ? 'vulnerable' : pkgConflicts.length ? 'peer-conflict' : 'outdated',
      name,
      currentVersion: outdatedInfo?.current || 'unknown',
      latestVersion: outdatedInfo?.latest || 'unknown',
      lastPublish: outdatedInfo?.lastPublish,
      vulnerabilities: pkgVulns,
      peerConflicts: pkgConflicts,
      compatIssues: pkgCompat,
    });
  }

  return issues;
}
