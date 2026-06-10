// Terminal reporter with color badges

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

const SEVERITY_BADGE = {
  critical: `${COLORS.red}${COLORS.bold}CRIT${COLORS.reset}`,
  high: `${COLORS.red}HIGH${COLORS.reset}`,
  medium: `${COLORS.yellow}MED ${COLORS.reset}`,
  low: `${COLORS.green}LOW ${COLORS.reset}`,
  unknown: `${COLORS.gray}UNK ${COLORS.reset}`,
};

const STRATEGY_BADGE = {
  'safe-upgrade': `${COLORS.green}⬆ safe-upgrade${COLORS.reset}`,
  'major-upgrade': `${COLORS.yellow}⬆ major-upgrade${COLORS.reset}`,
  'override': `${COLORS.cyan}⚙ override${COLORS.reset}`,
  'adapter': `${COLORS.magenta}🔌 adapter${COLORS.reset}`,
  'fork-patch': `${COLORS.red}🍴 fork-patch${COLORS.reset}`,
  'replacement': `${COLORS.red}♻ replacement${COLORS.reset}`,
  'skip': `${COLORS.gray}⏭ skip${COLORS.reset}`,
};

export function printScanHeader(projectName) {
  console.log(`\n${COLORS.bold}┌──────────────────────────────────────┐${COLORS.reset}`);
  console.log(`${COLORS.bold}│  dep-doctor v2 — Scan Report         │${COLORS.reset}`);
  console.log(`${COLORS.bold}│  ${COLORS.cyan}${projectName.padEnd(37)}${COLORS.reset}${COLORS.bold}│${COLORS.reset}`);
  console.log(`${COLORS.bold}└──────────────────────────────────────┘${COLORS.reset}\n`);
}

export function printSection(title) {
  console.log(`${COLORS.bold}${COLORS.blue}── ${title} ${'─'.repeat(Math.max(0, 35 - title.length))}${COLORS.reset}\n`);
}

export function printDependencyTable(deps, title) {
  if (!deps.length) return;
  printSection(title);

  const maxName = Math.max(20, ...deps.map(d => d.name.length));
  const header = `  ${'Package'.padEnd(maxName)} ${'Current'.padEnd(10)} ${'Latest'.padEnd(10)} Upgrade`;
  console.log(`${COLORS.gray}${header}${COLORS.reset}`);
  console.log(`${COLORS.gray}  ${'─'.repeat(header.length - 2)}${COLORS.reset}`);

  for (const dep of deps) {
    const upgradeType = dep.upgradeType || 'unknown';
    const color = upgradeType === 'patch' ? COLORS.green : upgradeType === 'minor' ? COLORS.yellow : COLORS.red;
    console.log(`  ${dep.name.padEnd(maxName)} ${(dep.current || '?').padEnd(10)} ${color}${(dep.latest || '?').padEnd(10)}${COLORS.reset} ${upgradeType}`);
  }
  console.log('');
}

export function printVulnerabilities(vulns) {
  if (!vulns.length) return;
  printSection('Vulnerabilities');

  for (const v of vulns) {
    const badge = SEVERITY_BADGE[v.severity] || SEVERITY_BADGE.unknown;
    console.log(`  [${badge}] ${COLORS.bold}${v.package}${COLORS.reset} — ${v.title}`);
    if (v.cve) console.log(`         CVE: ${v.cve}`);
    if (v.fixedIn) console.log(`         Fix: upgrade to ${COLORS.green}${v.fixedIn}${COLORS.reset}`);
    console.log('');
  }
}

export function printPeerConflicts(conflicts) {
  if (!conflicts.length) return;
  printSection('Peer Dependency Conflicts');

  for (const c of conflicts) {
    console.log(`  ${COLORS.red}✗${COLORS.reset} ${COLORS.bold}${c.package}${COLORS.reset} requires ${c.peerDep}@${c.required}`);
    console.log(`    installed: ${c.installed || 'missing'}`);
    console.log('');
  }
}

export function printCompatIssues(findings, summary) {
  if (!findings.length) return;
  printSection(`Code Compatibility (${summary.total} issues in ${summary.uniqueFiles} files)`);

  console.log(`  ${COLORS.red}Critical: ${summary.critical}${COLORS.reset} | ${COLORS.yellow}High: ${summary.high}${COLORS.reset} | Estimated: ${COLORS.bold}${summary.estimatedHours}h${COLORS.reset}\n`);

  // Group by API
  for (const [api, info] of Object.entries(summary.byApi)) {
    const badge = SEVERITY_BADGE[info.severity] || '';
    console.log(`  [${badge}] ${api} — ${info.count} usage(s) in ${info.files.size} file(s)`);
  }
  console.log('');
}

export function printPlan(plan) {
  if (!plan.length) return;
  printSection('Fix Plan');

  for (const action of plan) {
    const badge = STRATEGY_BADGE[action.strategy] || action.strategy;
    const risk = SEVERITY_BADGE[action.risk] || action.risk;
    console.log(`  ${badge}  ${COLORS.bold}${action.package}${COLORS.reset}`);
    console.log(`    Risk: ${risk} | Effort: ${action.effort}`);
    console.log(`    ${COLORS.gray}${action.reason}${COLORS.reset}`);
    console.log('');
  }
}

export function printSummary(stats) {
  printSection('Summary');
  console.log(`  Total packages:     ${stats.total}`);
  console.log(`  Outdated:           ${stats.outdated}`);
  console.log(`  Vulnerable:         ${COLORS.red}${stats.vulnerable}${COLORS.reset}`);
  console.log(`  Peer conflicts:     ${COLORS.yellow}${stats.peerConflicts}${COLORS.reset}`);
  console.log(`  Code compat issues: ${stats.compatIssues}`);
  console.log(`  Estimated effort:   ${COLORS.bold}${stats.estimatedHours}h${COLORS.reset}`);
  console.log('');
}
