#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { scanCommand } from '../src/commands/scan.js';
import { fixCommand } from '../src/commands/fix.js';
import { whyCommand } from '../src/commands/why.js';
import { checkCommand } from '../src/commands/check.js';

const USAGE = `
dep-doctor v2.0.0 — Dependency health scanner + fixer

Usage:
  dep-doctor scan   [--path <dir>] [--format json|terminal] [--vuln-report <file>]
  dep-doctor fix    [--path <dir>] [--dry-run] [--strategy <name>] [--risk <level>]
  dep-doctor why    [--path <dir>] <package-name>
  dep-doctor check  [--path <dir>] [--ci]

Commands:
  scan     Analyze dependencies: outdated, vulnerable, peerDep conflicts
  fix      Auto-fix issues with rollback support
  why      Show why a package is installed and what constrains it
  check    CI pre-push validation (lockfile sync, peerDeps, vulns)

Options:
  --path <dir>         Project directory (default: cwd)
  --format <type>      Output format: terminal, json (default: terminal)
  --dry-run            Show what would change without modifying files
  --strategy <name>    Force strategy: safe-upgrade, override, adapter, fork-patch
  --risk <level>       Max risk level to auto-fix: low, medium, high (default: medium)
  --vuln-report <file> Path to npm audit or Sonatype IQ JSON report
  --ci                 CI mode: exit 1 on any issue
  --help               Show this help
`;

const command = process.argv[2];

if (!command || command === '--help' || command === '-h') {
  console.log(USAGE);
  process.exit(0);
}

const args = process.argv.slice(3);
const { values: opts } = parseArgs({
  args,
  options: {
    path: { type: 'string', default: process.cwd() },
    format: { type: 'string', default: 'terminal' },
    'dry-run': { type: 'boolean', default: false },
    strategy: { type: 'string' },
    risk: { type: 'string', default: 'medium' },
    'vuln-report': { type: 'string' },
    ci: { type: 'boolean', default: false },
  },
  allowPositionals: true,
  strict: false,
});

const options = {
  projectPath: opts.path,
  format: opts.format,
  dryRun: opts['dry-run'],
  strategy: opts.strategy,
  maxRisk: opts.risk,
  vulnReport: opts['vuln-report'],
  ci: opts.ci,
  positionals: args.filter(a => !a.startsWith('--')),
};

try {
  switch (command) {
    case 'scan':
      await scanCommand(options);
      break;
    case 'fix':
      await fixCommand(options);
      break;
    case 'why':
      await whyCommand(options);
      break;
    case 'check':
      await checkCommand(options);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(USAGE);
      process.exit(1);
  }
} catch (err) {
  console.error(`\n❌ Error: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}
