import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function buildDependencyGraph(projectPath) {
  const pkgPath = join(projectPath, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json found at ${projectPath}`);
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const lockPath = join(projectPath, 'package-lock.json');
  const pnpmLockPath = join(projectPath, 'pnpm-lock.yaml');

  const graph = {
    name: pkg.name || 'unnamed',
    version: pkg.version || '0.0.0',
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    overrides: pkg.overrides || {},
    resolutions: pkg.resolutions || {},
    nodes: new Map(),
    edges: [],
  };

  // Direct deps from package.json
  for (const [name, range] of Object.entries(pkg.dependencies || {})) {
    graph.dependencies[name] = range;
  }
  for (const [name, range] of Object.entries(pkg.devDependencies || {})) {
    graph.devDependencies[name] = range;
  }
  for (const [name, range] of Object.entries(pkg.peerDependencies || {})) {
    graph.peerDependencies[name] = range;
  }

  // Parse lockfile for transitive deps
  if (existsSync(lockPath)) {
    parseLockfileV2(lockPath, graph);
  } else if (existsSync(pnpmLockPath)) {
    parsePnpmLock(pnpmLockPath, graph);
  }

  return graph;
}

function parseLockfileV2(lockPath, graph) {
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const packages = lock.packages || {};

    for (const [path, info] of Object.entries(packages)) {
      if (!path || path === '') continue;
      // node_modules/react or node_modules/@scope/name
      const name = path.replace(/^node_modules\//, '').split('node_modules/').pop();
      if (!name) continue;

      graph.nodes.set(name, {
        version: info.version,
        resolved: info.resolved,
        dependencies: info.dependencies || {},
        peerDependencies: info.peerDependencies || {},
        peerDependenciesMeta: info.peerDependenciesMeta || {},
        dev: info.dev || false,
        optional: info.optional || false,
      });

      // Build edges
      for (const dep of Object.keys(info.dependencies || {})) {
        graph.edges.push({ from: name, to: dep, type: 'dependency' });
      }
      for (const dep of Object.keys(info.peerDependencies || {})) {
        const meta = info.peerDependenciesMeta?.[dep];
        graph.edges.push({
          from: name,
          to: dep,
          type: 'peerDependency',
          optional: meta?.optional || false,
        });
      }
    }
  } catch (err) {
    console.warn(`⚠️  Could not parse lockfile: ${err.message}`);
  }
}

function parsePnpmLock(lockPath, graph) {
  // Basic pnpm-lock.yaml parsing (YAML subset, no external dep)
  try {
    const content = readFileSync(lockPath, 'utf8');
    const lines = content.split('\n');
    let currentPkg = null;

    for (const line of lines) {
      // Match package entries like: /react@18.2.0:
      const pkgMatch = line.match(/^\s+'?\/([^@]+)@([^:'"]+)/);
      if (pkgMatch) {
        currentPkg = pkgMatch[1];
        graph.nodes.set(currentPkg, {
          version: pkgMatch[2],
          dependencies: {},
          peerDependencies: {},
        });
        continue;
      }

      if (currentPkg && line.match(/^\s{4}peerDependencies:/)) {
        // Mark next indented block as peerDeps
        currentPkg = `${currentPkg}:peer`;
        continue;
      }
      if (currentPkg && line.match(/^\s{4}dependencies:/)) {
        // Reset to normal deps (strip :peer suffix if present)
        currentPkg = currentPkg.replace(/:peer$/, '');
        continue;
      }
      if (currentPkg && line.match(/^\s{6,}\S/)) {
        const depMatch = line.trim().match(/^['"]?([^:'"]+)['"]?:\s*['"]?([^'"]+)/);
        if (depMatch) {
          const isPeer = currentPkg.endsWith(':peer');
          const pkgName = currentPkg.replace(/:peer$/, '');
          const node = graph.nodes.get(pkgName);
          if (node) {
            if (isPeer) {
              node.peerDependencies[depMatch[1]] = depMatch[2];
              graph.edges.push({ from: pkgName, to: depMatch[1], type: 'peerDependency' });
            } else {
              node.dependencies[depMatch[1]] = depMatch[2];
              graph.edges.push({ from: pkgName, to: depMatch[1], type: 'dependency' });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️  Could not parse pnpm lockfile: ${err.message}`);
  }
}

export function getInstalledVersion(graph, packageName) {
  const node = graph.nodes.get(packageName);
  return node?.version || null;
}

export function getDependentsOf(graph, packageName) {
  return graph.edges
    .filter(e => e.to === packageName)
    .map(e => ({ name: e.from, type: e.type }));
}

export function getTransitiveDeps(graph, packageName, visited = new Set()) {
  if (visited.has(packageName)) return [];
  visited.add(packageName);

  const node = graph.nodes.get(packageName);
  if (!node) return [];

  const deps = Object.keys(node.dependencies || {});
  const transitive = [];
  for (const dep of deps) {
    transitive.push(dep);
    transitive.push(...getTransitiveDeps(graph, dep, visited));
  }
  return [...new Set(transitive)];
}
