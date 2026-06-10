import { satisfies } from '../infra/semver-lite.js';

export function detectPeerConflicts(graph) {
  const conflicts = [];

  for (const [name, node] of graph.nodes) {
    const peerDeps = node.peerDependencies || {};
    for (const [peerName, requiredRange] of Object.entries(peerDeps)) {
      const meta = node.peerDependenciesMeta?.[peerName];
      if (meta?.optional) continue;

      const installedNode = graph.nodes.get(peerName);
      const installedVersion = installedNode?.version;

      // Also check direct deps
      const directVersion = graph.dependencies[peerName]?.replace(/^[\^~>=<\s]+/, '');

      const effectiveVersion = installedVersion || directVersion;

      if (!effectiveVersion) {
        conflicts.push({
          package: name,
          packageVersion: node.version,
          peerDep: peerName,
          required: requiredRange,
          installed: null,
          satisfied: false,
          severity: 'missing',
          message: `${name} requires peer ${peerName}@${requiredRange} but it's not installed`,
        });
        continue;
      }

      const isSatisfied = satisfies(effectiveVersion, requiredRange);
      if (!isSatisfied) {
        conflicts.push({
          package: name,
          packageVersion: node.version,
          peerDep: peerName,
          required: requiredRange,
          installed: effectiveVersion,
          satisfied: false,
          severity: 'conflict',
          message: `${name} requires peer ${peerName}@${requiredRange} but ${effectiveVersion} is installed`,
        });
      }
    }
  }

  return conflicts;
}

export function findBlockingChains(graph, targetPackage, targetVersion) {
  // Find all packages whose peerDeps would be violated if we upgrade targetPackage
  const blockers = [];

  for (const [name, node] of graph.nodes) {
    const peerRange = node.peerDependencies?.[targetPackage];
    if (!peerRange) continue;

    const wouldSatisfy = satisfies(targetVersion, peerRange);
    if (!wouldSatisfy) {
      blockers.push({
        blocker: name,
        blockerVersion: node.version,
        constraintOn: targetPackage,
        allowedRange: peerRange,
        wouldBreakWith: targetVersion,
      });
    }
  }

  return blockers;
}
