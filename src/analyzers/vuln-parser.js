import { readFileSync, existsSync } from 'node:fs';

// Normalized vulnerability format
// { package, version, severity, cve, title, fixedIn, advisory, source }

export function parseVulnReport(filePath) {
  if (!filePath || !existsSync(filePath)) return [];

  const raw = JSON.parse(readFileSync(filePath, 'utf8'));

  // Detect format
  if (raw.vulnerabilities) return parseNpmAudit(raw);
  if (raw.components) return parseSonatypeIQ(raw);
  if (Array.isArray(raw.advisories)) return parseLegacyNpmAudit(raw);

  console.warn('⚠️  Unknown vulnerability report format');
  return [];
}

function parseNpmAudit(report) {
  const vulns = [];
  for (const [name, info] of Object.entries(report.vulnerabilities || {})) {
    for (const via of (info.via || [])) {
      if (typeof via === 'string') continue; // indirect ref
      vulns.push({
        package: name,
        version: info.range || '*',
        severity: via.severity || info.severity || 'unknown',
        cve: via.cve || null,
        title: via.title || via.name || 'Untitled',
        fixedIn: info.fixAvailable?.version || null,
        advisory: via.url || null,
        source: 'npm-audit',
      });
    }
  }
  return vulns;
}

function parseSonatypeIQ(report) {
  const vulns = [];
  for (const component of (report.components || [])) {
    const pkgName = component.packageUrl?.replace(/^pkg:npm\//, '').split('@')[0] || component.displayName;
    const version = component.packageUrl?.split('@').pop() || 'unknown';

    for (const issue of (component.securityData?.securityIssues || [])) {
      vulns.push({
        package: pkgName,
        version,
        severity: mapSonatypeSeverity(issue.severity),
        cve: issue.reference || null,
        title: issue.source || issue.reference || 'Untitled',
        fixedIn: null, // Sonatype IQ doesn't always provide fix version
        advisory: issue.url || null,
        source: 'sonatype-iq',
      });
    }
  }
  return vulns;
}

function parseLegacyNpmAudit(report) {
  const vulns = [];
  for (const advisory of (report.advisories || [])) {
    vulns.push({
      package: advisory.module_name,
      version: advisory.findings?.[0]?.version || '*',
      severity: advisory.severity,
      cve: advisory.cves?.[0] || null,
      title: advisory.title,
      fixedIn: advisory.patched_versions || null,
      advisory: advisory.url || null,
      source: 'npm-audit-legacy',
    });
  }
  return vulns;
}

function mapSonatypeSeverity(score) {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'moderate';
  return 'low';
}

export function groupVulnsByPackage(vulns) {
  const grouped = {};
  for (const v of vulns) {
    if (!grouped[v.package]) grouped[v.package] = [];
    grouped[v.package].push(v);
  }
  return grouped;
}

export function getHighestSeverity(vulns) {
  const order = { critical: 4, high: 3, moderate: 2, low: 1, unknown: 0 };
  let max = 'unknown';
  for (const v of vulns) {
    if ((order[v.severity] || 0) > (order[max] || 0)) max = v.severity;
  }
  return max;
}
