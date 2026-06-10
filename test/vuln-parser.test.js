import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseVulnReport, groupVulnsByPackage, getHighestSeverity } from '../src/analyzers/vuln-parser.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('parseVulnReport: parses npm-audit report', () => {
  const vulns = parseVulnReport(join(fixtures, 'npm-audit-sample.json'));
  assert.ok(Array.isArray(vulns));
  assert.ok(vulns.length > 0);
  assert.ok(vulns[0].package);
  assert.ok(vulns[0].severity);
});

test('parseVulnReport: parses Sonatype IQ report', () => {
  const vulns = parseVulnReport(join(fixtures, 'sonatype-iq-sample.json'));
  assert.ok(Array.isArray(vulns));
  assert.ok(vulns.length > 0);
});

test('groupVulnsByPackage + getHighestSeverity', () => {
  const vulns = parseVulnReport(join(fixtures, 'npm-audit-sample.json'));
  const grouped = groupVulnsByPackage(vulns);
  assert.ok(Object.keys(grouped).length > 0);
  const sev = getHighestSeverity(vulns);
  assert.ok(['critical', 'high', 'moderate', 'medium', 'low'].includes(sev));
});
