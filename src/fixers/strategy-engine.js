import { classifyUpgrade, parseSemver } from '../infra/registry.js';

// Strategy decision tree
// Input: scan results (issues array)
// Output: action plan array with strategy, risk, effort, steps

const STRATEGIES = {
  SAFE_UPGRADE: 'safe-upgrade',
  MAJOR_UPGRADE: 'major-upgrade',
  OVERRIDE: 'override',
  ADAPTER: 'adapter',
  FORK_PATCH: 'fork-patch',
  REPLACEMENT: 'replacement',
  SKIP: 'skip',
};

const RISK_LEVELS = { low: 1, medium: 2, high: 3 };

export function generatePlan(issues) {
  const plan = [];

  for (const issue of issues) {
    const action = decideStrategy(issue);
    plan.push(action);
  }

  // Sort: low risk first, then medium, then high
  plan.sort((a, b) => RISK_LEVELS[a.risk] - RISK_LEVELS[b.risk]);
  return plan;
}

function decideStrategy(issue) {
  const { type, name, currentVersion, latestVersion, vulnerabilities, peerConflicts, compatIssues } = issue;

  // VULNERABLE — highest priority
  if (vulnerabilities?.length > 0) {
    return decideVulnStrategy(issue);
  }

  // PEERDEP CONFLICT
  if (peerConflicts?.length > 0) {
    return decidePeerConflictStrategy(issue);
  }

  // OUTDATED
  if (latestVersion && currentVersion) {
    return decideUpgradeStrategy(issue);
  }

  return {
    package: name,
    strategy: STRATEGIES.SKIP,
    risk: 'low',
    effort: 'none',
    reason: 'No actionable issue detected',
    steps: [],
  };
}

function decideVulnStrategy(issue) {
  const { name, currentVersion, latestVersion, vulnerabilities } = issue;
  const upgrade = classifyUpgrade(currentVersion, latestVersion);
  const fixAvailable = vulnerabilities.some(v => v.fixedIn);

  if (fixAvailable && (upgrade === 'patch' || upgrade === 'minor')) {
    return {
      package: name,
      strategy: STRATEGIES.SAFE_UPGRADE,
      risk: 'low',
      effort: 'auto',
      reason: `Vulnerability fix available in ${upgrade} upgrade`,
      steps: [
        { action: 'upgrade', target: latestVersion },
        { action: 'install' },
        { action: 'test' },
      ],
    };
  }

  if (fixAvailable && upgrade === 'major') {
    const hasBreaking = issue.compatIssues?.length > 0;
    return {
      package: name,
      strategy: hasBreaking ? STRATEGIES.MAJOR_UPGRADE : STRATEGIES.SAFE_UPGRADE,
      risk: hasBreaking ? 'high' : 'medium',
      effort: hasBreaking ? '1-2 days' : '30min',
      reason: `Vulnerability fix requires major upgrade ${currentVersion} → ${latestVersion}`,
      steps: [
        { action: 'upgrade', target: latestVersion },
        ...(hasBreaking ? [{ action: 'codemod', patterns: issue.compatIssues }] : []),
        { action: 'install' },
        { action: 'test' },
      ],
    };
  }

  // No fix — override transitive or fork-patch
  return {
    package: name,
    strategy: STRATEGIES.OVERRIDE,
    risk: 'medium',
    effort: '1hr',
    reason: 'No patched version available — override transitive dependency',
    steps: [
      { action: 'add-override', package: name },
      { action: 'install' },
      { action: 'test' },
    ],
  };
}

function decidePeerConflictStrategy(issue) {
  const { name, currentVersion, peerConflicts, compatIssues } = issue;

  // Check if blocker is unmaintained
  const isUnmaintained = issue.lastPublish && isStale(issue.lastPublish);
  const deprecatedApiCount = compatIssues?.length || 0;

  if (isUnmaintained) {
    if (deprecatedApiCount < 10) {
      return {
        package: name,
        strategy: STRATEGIES.ADAPTER,
        risk: 'medium',
        effort: '1-2 days',
        reason: `${name} is unmaintained with ${deprecatedApiCount} deprecated API usages — adapter pattern recommended`,
        steps: [
          { action: 'generate-adapter', package: name },
          { action: 'add-override', package: name },
          { action: 'install' },
          { action: 'test' },
        ],
      };
    }

    if (deprecatedApiCount < 50) {
      return {
        package: name,
        strategy: STRATEGIES.ADAPTER,
        risk: 'high',
        effort: '3-5 days',
        reason: `${name} is unmaintained with ${deprecatedApiCount} deprecated API usages — adapter pattern feasible but significant effort`,
        steps: [
          { action: 'generate-adapter', package: name },
          { action: 'add-override', package: name },
          { action: 'install' },
          { action: 'test' },
        ],
      };
    }

    return {
      package: name,
      strategy: STRATEGIES.REPLACEMENT,
      risk: 'high',
      effort: '1-2 weeks',
      reason: `${name} is unmaintained with ${deprecatedApiCount}+ deprecated API usages — full replacement recommended`,
      steps: [
        { action: 'find-alternative', package: name },
        { action: 'migration-guide' },
      ],
    };
  }

  // Maintained but has conflict — override
  return {
    package: name,
    strategy: STRATEGIES.OVERRIDE,
    risk: 'low',
    effort: '15min',
    reason: `peerDep conflict — ${name} will likely release compatible version soon`,
    steps: [
      { action: 'add-override', package: name, peerConflicts },
      { action: 'install' },
      { action: 'test' },
    ],
  };
}

function decideUpgradeStrategy(issue) {
  const { name, currentVersion, latestVersion, compatIssues } = issue;
  const upgrade = classifyUpgrade(currentVersion, latestVersion);

  if (upgrade === 'patch') {
    return {
      package: name,
      strategy: STRATEGIES.SAFE_UPGRADE,
      risk: 'low',
      effort: 'auto',
      reason: `Patch update: ${currentVersion} → ${latestVersion}`,
      steps: [
        { action: 'upgrade', target: latestVersion },
        { action: 'install' },
        { action: 'test' },
      ],
    };
  }

  if (upgrade === 'minor') {
    return {
      package: name,
      strategy: STRATEGIES.SAFE_UPGRADE,
      risk: 'low',
      effort: '5min',
      reason: `Minor update: ${currentVersion} → ${latestVersion}`,
      steps: [
        { action: 'upgrade', target: latestVersion },
        { action: 'install' },
        { action: 'test' },
      ],
    };
  }

  if (upgrade === 'major') {
    const hasBreaking = compatIssues?.length > 0;
    return {
      package: name,
      strategy: hasBreaking ? STRATEGIES.MAJOR_UPGRADE : STRATEGIES.SAFE_UPGRADE,
      risk: hasBreaking ? 'high' : 'medium',
      effort: hasBreaking ? '1-5 days' : '30min',
      reason: `Major update: ${currentVersion} → ${latestVersion}${hasBreaking ? ` (${compatIssues.length} breaking patterns found)` : ''}`,
      steps: [
        { action: 'upgrade', target: latestVersion },
        ...(hasBreaking ? [{ action: 'codemod', patterns: compatIssues }] : []),
        { action: 'install' },
        { action: 'test' },
      ],
    };
  }

  return {
    package: name,
    strategy: STRATEGIES.SKIP,
    risk: 'low',
    effort: 'none',
    reason: 'Already on latest version',
    steps: [],
  };
}

function isStale(dateStr) {
  const publishDate = new Date(dateStr);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return publishDate < oneYearAgo;
}

export { STRATEGIES, RISK_LEVELS };
