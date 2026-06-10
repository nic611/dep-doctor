import { resolve } from 'node:path';
import { buildDependencyGraph, getDependentsOf, getTransitiveDeps } from '../analyzers/dep-graph.js';
import { findBlockingChains } from '../analyzers/peer-conflicts.js';

export async function whyCommand(options) {
  const projectPath = resolve(options.projectPath);
  const packageName = options.positionals?.[0];

  if (!packageName) {
    console.error('Usage: dep-doctor why <package-name>');
    process.exit(1);
  }

  const graph = buildDependencyGraph(projectPath);
  const node = graph.nodes.get(packageName);

  console.log(`\n📦 ${packageName}`);
  console.log(`${'─'.repeat(40)}`);

  // Installed version
  if (node) {
    console.log(`  Version:  ${node.version}`);
  } else {
    const directDep = graph.dependencies[packageName] || graph.devDependencies[packageName];
    if (directDep) {
      console.log(`  Range:    ${directDep}`);
      console.log(`  (not in lockfile — run install first)`);
    } else {
      console.log(`  Not found in project dependencies.`);
      return;
    }
  }

  // Direct or transitive?
  const isDirect = !!(graph.dependencies[packageName] || graph.devDependencies[packageName]);
  const isDev = !!graph.devDependencies[packageName];
  console.log(`  Type:     ${isDirect ? (isDev ? 'devDependency' : 'dependency') : 'transitive'}`);

  // Who depends on this?
  const dependents = getDependentsOf(graph, packageName);
  if (dependents.length) {
    console.log(`\n  Required by:`);
    for (const d of dependents) {
      const depNode = graph.nodes.get(d.name);
      console.log(`    ${d.name}@${depNode?.version || '?'} (${d.type})`);
    }
  }

  // PeerDep constraints
  const peerConstraints = [];
  for (const [name, n] of graph.nodes) {
    if (n.peerDependencies?.[packageName]) {
      peerConstraints.push({ from: name, range: n.peerDependencies[packageName] });
    }
  }

  if (peerConstraints.length) {
    console.log(`\n  Peer dependency constraints:`);
    for (const c of peerConstraints) {
      console.log(`    ${c.from} requires ${packageName}@${c.range}`);
    }
  }

  // What blocks upgrade?
  console.log(`\n  What happens if I upgrade to latest?`);
  const blockers = findBlockingChains(graph, packageName, '99.0.0');
  if (blockers.length) {
    console.log(`    ⚠️  ${blockers.length} package(s) would break:`);
    for (const b of blockers) {
      console.log(`    ${b.blocker} requires ${packageName}@${b.allowedRange}`);
    }
  } else {
    console.log(`    ✅ No blocking peerDep constraints found`);
  }

  // Transitive deps
  if (node) {
    const transitive = getTransitiveDeps(graph, packageName);
    if (transitive.length) {
      console.log(`\n  Pulls in ${transitive.length} transitive dep(s):`);
      for (const t of transitive.slice(0, 10)) {
        console.log(`    ${t}`);
      }
      if (transitive.length > 10) console.log(`    ... and ${transitive.length - 10} more`);
    }
  }

  console.log('');
}
