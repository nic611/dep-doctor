# dep-doctor

Dependency health scanner + auto-fixer for enterprise React migrations.

Zero third-party dependencies — runs on Node.js built-ins only.

## Why

Migrating React 16 → 18 → 19 in enterprise projects means untangling hundreds of transitive dependencies, unmaintained packages, and peerDep conflicts. `dep-doctor` diagnoses the full landscape and auto-fixes what it can.

## Features

- **Scan** — outdated, vulnerable, and conflicting dependencies in one report
- **Fix** — auto-apply safe upgrades, overrides, and adapters with rollback on test failure
- **Why** — trace any package: who installed it, what constrains it, what blocks upgrading it
- **Check** — CI pre-push validation (lockfile sync, peerDeps, security)
- **Strategy Engine** — risk-weighted decision tree: safe-upgrade → override → adapter → fork-patch
- **Multi-PM** — auto-detects npm, pnpm, or yarn
- **Vuln Integration** — parses npm-audit and Sonatype IQ reports

## Quick Start

```bash
# From your project directory
node path/to/dep-doctor/bin/dep-doctor.js scan

# Or link globally
cd tools/dep-doctor && npm link
dep-doctor scan
```

## Commands

```bash
dep-doctor scan   [--format json] [--vuln-report audit.json]
dep-doctor fix    [--dry-run] [--strategy override] [--risk low]
dep-doctor why    <package-name>
dep-doctor check  [--ci]
```

| Command | What it does |
|---------|-------------|
| `scan` | Analyze all deps — outdated versions, vulnerabilities, peerDep conflicts, deprecated APIs |
| `fix` | Auto-fix with rollback support. Groups fixes by strategy and runs tests between groups |
| `why` | Show installed version, reverse deps, peer constraints, and upgrade blockers |
| `check` | Pre-push CI gate — lockfile sync, peerDeps clean, `.env` in `.gitignore`, Node version |

## Options

```
--path <dir>         Project directory (default: cwd)
--format <type>      terminal | json (default: terminal)
--dry-run            Preview changes without modifying files
--strategy <name>    Force: safe-upgrade | override | adapter | fork-patch
--risk <level>       Max risk to auto-fix: low | medium | high (default: medium)
--vuln-report <file> Path to npm-audit or Sonatype IQ JSON
--ci                 Strict mode — exit 1 on any issue
```

## Architecture

```
bin/dep-doctor.js          CLI entry (parseArgs → command routing)
src/
├── commands/              Command implementations
│   ├── scan.js            Full analysis pipeline
│   ├── fix.js             Multi-strategy fixer with rollback
│   ├── why.js             Dependency chain tracer
│   └── check.js           CI pre-push validation
├── analyzers/             Analysis engines
│   ├── dep-graph.js       Build dep tree from npm/pnpm lockfiles
│   ├── peer-conflicts.js  Detect peerDep violations
│   ├── compat-checker.js  Scan source for deprecated React APIs
│   └── vuln-parser.js     Parse npm-audit & Sonatype IQ reports
├── fixers/                Fix strategies
│   ├── strategy-engine.js Decision tree (risk × effort → strategy)
│   ├── safe-upgrade.js    Patch/minor upgrades with test validation
│   ├── override-fixer.js  Add package.json overrides
│   ├── adapter-generator.js  Generate compatibility shims
│   ├── fork-patch.js      Generate fork-patch guides
│   └── codemod-runner.js  AST-based code transforms
├── infra/                 Infrastructure
│   ├── registry.js        npm registry client + cache (~/.dep-doctor/)
│   ├── pm-detect.js       Auto-detect npm/pnpm/yarn
│   ├── git-state.js       Git dirty check for safety
│   ├── semver-lite.js     Lightweight semver comparison
│   └── runner.js          Subprocess executor
└── reporter/              Output formatting
    ├── terminal.js        Colored tables + badges
    ├── json-reporter.js   Structured JSON output
    └── migration-guide.js Generate MIGRATION-GUIDE.md
```

## Fix Strategy Decision Tree

```
Package Issue
  │
  ├── Patch/minor available? ──→ SAFE_UPGRADE (low risk)
  │
  ├── peerDep conflict? ──→ OVERRIDE (medium risk)
  │
  ├── Deprecated API usage?
  │   ├── < 10 occurrences ──→ ADAPTER (medium risk)
  │   └── 10-50 occurrences ──→ ADAPTER (high risk)
  │   └── 50+ occurrences ──→ REPLACEMENT (high risk)
  │
  └── Unmaintained? ──→ FORK_PATCH (high risk)
```

## Example Output

```
┌─────────────────┬──────────┬──────────┬──────────────┬────────────┐
│ Package         │ Current  │ Latest   │ Status       │ Strategy   │
├─────────────────┼──────────┼──────────┼──────────────┼────────────┤
│ react           │ 16.14.0  │ 19.2.0   │ 🔴 MAJOR     │ ⬆ upgrade  │
│ lodash          │ 4.17.15  │ 4.17.21  │ 🟡 OUTDATED  │ ⬆ safe     │
│ @xx/core        │ 2.1.0    │ —        │ 🟠 UNMAINT   │ 🔌 adapter │
│ cheerio         │ 1.0.0    │ 1.0.0    │ 🟢 OK        │ —          │
└─────────────────┴──────────┴──────────┴──────────────┴────────────┘

Summary: 142 packages │ 3 outdated │ 1 vulnerable │ 2 peerDep conflicts
```

## Requirements

- Node.js 18+ (uses native `fetch`, `parseArgs`)
- No `npm install` needed — zero dependencies

## v1 → v2 Changes

| | v1 (GPT-generated) | v2 |
|---|---|---|
| Dependencies | chalk, ora, cli-table3, commander, p-limit, semver | None (Node.js built-ins only) |
| Commands | `scan`, `why` | `scan`, `fix`, `why`, `check` |
| Fix engine | — | Strategy engine with rollback |
| Vuln sources | npm-audit only | npm-audit + Sonatype IQ |
| peerDep analysis | Basic | Full conflict detection + blocking chain |
| Code compat | — | Scans source for deprecated React APIs |

## Known Limitations

- Cache is saved after every fetch (batch save at exit would be more efficient)
- Adapter output directory hardcoded to `src/adapters/`
- No `--depth=direct` flag yet (scans all deps including transitive)

## License

MIT
