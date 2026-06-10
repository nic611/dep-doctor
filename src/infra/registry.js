import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE_DIR = join(homedir(), '.dep-doctor');
const CACHE_FILE = join(CACHE_DIR, 'registry-cache.json');
const CACHE_TTL = 3600000; // 1 hour

let cache = null;

function loadCache() {
  if (cache) return cache;
  try {
    if (existsSync(CACHE_FILE)) {
      cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    } else {
      cache = {};
    }
  } catch {
    cache = {};
  }
  return cache;
}

function saveCache() {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch { /* ignore cache write failures */ }
}

function isCacheValid(entry) {
  return entry && (Date.now() - entry.timestamp) < CACHE_TTL;
}

export async function fetchPackageInfo(packageName) {
  const c = loadCache();
  if (isCacheValid(c[packageName])) {
    return c[packageName].data;
  }

  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Registry error for ${packageName}: ${res.status}`);
  }

  const data = await res.json();
  const info = {
    name: data.name,
    latestVersion: data['dist-tags']?.latest,
    versions: Object.keys(data.versions || {}),
    deprecated: data.versions?.[data['dist-tags']?.latest]?.deprecated || null,
    lastPublish: data.time?.[data['dist-tags']?.latest] || null,
    peerDependencies: data.versions?.[data['dist-tags']?.latest]?.peerDependencies || {},
    homepage: data.homepage,
    repository: data.repository?.url,
  };

  c[packageName] = { data: info, timestamp: Date.now() };
  saveCache();
  return info;
}

export async function getLatestSafeVersion(packageName, currentMajor) {
  const info = await fetchPackageInfo(packageName);
  const versions = info.versions
    .filter(v => v.match(/^\d+\.\d+\.\d+$/)) // skip prereleases
    .sort((a, b) => compareSemver(b, a)); // newest first

  // Find latest in same major
  const sameMajor = versions.find(v => parseInt(v.split('.')[0]) === currentMajor);
  return {
    latest: info.latestVersion,
    latestSameMajor: sameMajor || null,
    isDeprecated: !!info.deprecated,
    lastPublish: info.lastPublish,
    peerDependencies: info.peerDependencies,
  };
}

export function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

export function parseSemver(version) {
  const clean = version.replace(/^[^0-9]*/, '');
  const [major, minor, patch] = clean.split('.').map(Number);
  return { major: major || 0, minor: minor || 0, patch: patch || 0 };
}

export function classifyUpgrade(current, latest) {
  const c = parseSemver(current);
  const l = parseSemver(latest);
  if (l.major > c.major) return 'major';
  if (l.minor > c.minor) return 'minor';
  if (l.patch > c.patch) return 'patch';
  return 'current';
}
