export function formatAsJson(scanResult) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    project: scanResult.projectName,
    packageManager: scanResult.pm,
    summary: scanResult.summary,
    outdated: scanResult.outdated,
    vulnerabilities: scanResult.vulnerabilities,
    peerConflicts: scanResult.peerConflicts,
    compatIssues: scanResult.compatFindings,
    plan: scanResult.plan,
  }, null, 2);
}
