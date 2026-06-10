// Lightweight semver satisfies() — no external deps
// Handles: ^x.y.z, ~x.y.z, >=x.y.z, x.y.z, *

export function parse(version) {
  const clean = version.replace(/^[v=\s]+/, '');
  const m = clean.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

export function satisfies(version, range) {
  const v = parse(version);
  if (!v) return false;

  // Handle || (union ranges)
  if (range.includes('||')) {
    return range.split('||').some(r => satisfies(version, r.trim()));
  }

  // Handle space-separated (intersection)
  const parts = range.trim().split(/\s+/);
  if (parts.length > 1 && !parts[0].startsWith('>') && !parts[0].startsWith('<')) {
    // Probably ">=x.y.z <x.y.z"
    return parts.every(p => satisfies(version, p));
  }
  if (parts.length === 2) {
    return parts.every(p => satisfies(version, p));
  }

  const r = range.trim();

  if (r === '*' || r === '') return true;

  // Caret: ^major.minor.patch
  if (r.startsWith('^')) {
    const target = parse(r.slice(1));
    if (!target) return false;
    if (v.major !== target.major) return false;
    if (target.major === 0) {
      if (v.minor !== target.minor) return false;
      return v.patch >= target.patch;
    }
    if (v.minor > target.minor) return true;
    if (v.minor === target.minor) return v.patch >= target.patch;
    return false;
  }

  // Tilde: ~major.minor.patch
  if (r.startsWith('~')) {
    const target = parse(r.slice(1));
    if (!target) return false;
    return v.major === target.major && v.minor === target.minor && v.patch >= target.patch;
  }

  // >=, >, <=, <, =
  if (r.startsWith('>=')) return compare(v, parse(r.slice(2))) >= 0;
  if (r.startsWith('>')) return compare(v, parse(r.slice(1))) > 0;
  if (r.startsWith('<=')) return compare(v, parse(r.slice(2))) <= 0;
  if (r.startsWith('<')) return compare(v, parse(r.slice(1))) < 0;
  if (r.startsWith('=')) return compare(v, parse(r.slice(1))) === 0;

  // Exact match
  const target = parse(r);
  if (!target) return false;
  return compare(v, target) === 0;
}

function compare(a, b) {
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}
