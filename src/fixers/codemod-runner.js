import { readFileSync, writeFileSync } from 'node:fs';

// Built-in codemods for common migration patterns
const CODEMODS = {
  'react-18-createroot': {
    name: 'ReactDOM.render → createRoot',
    pattern: /ReactDOM\.render\(\s*(<[^>]+>|[\w.]+)\s*,\s*document\.getElementById\(['"]([^'"]+)['"]\)\s*\)/g,
    replace: (match, component, elementId) =>
      `const root = createRoot(document.getElementById('${elementId}'));\nroot.render(${component})`,
    imports: { add: "import { createRoot } from 'react-dom/client';", remove: "import ReactDOM from 'react-dom'" },
  },
  'react-18-hydrate': {
    name: 'ReactDOM.hydrate → hydrateRoot',
    pattern: /ReactDOM\.hydrate\(\s*(<[^>]+>|[\w.]+)\s*,\s*document\.getElementById\(['"]([^'"]+)['"]\)\s*\)/g,
    replace: (match, component, elementId) =>
      `hydrateRoot(document.getElementById('${elementId}'), ${component})`,
    imports: { add: "import { hydrateRoot } from 'react-dom/client';" },
  },
  'router-v6-switch': {
    name: '<Switch> → <Routes>',
    pattern: /<Switch>/g,
    replace: () => '<Routes>',
    patternEnd: /<\/Switch>/g,
    replaceEnd: () => '</Routes>',
  },
  'router-v6-redirect': {
    name: '<Redirect> → <Navigate>',
    pattern: /<Redirect\s+to=\{?['"]([^'"]+)['"]\}?\s*\/?>/g,
    replace: (match, to) => `<Navigate to="${to}" replace />`,
  },
};

export function runCodemod(filePath, codemodName, { dryRun = false } = {}) {
  const codemod = CODEMODS[codemodName];
  if (!codemod) return { success: false, error: `Unknown codemod: ${codemodName}` };

  const original = readFileSync(filePath, 'utf8');
  let content = original;

  // Apply pattern replacement
  const matchCount = (content.match(codemod.pattern) || []).length;
  if (matchCount === 0) return { success: true, changes: 0, file: filePath };

  content = content.replace(codemod.pattern, codemod.replace);

  // Apply end pattern if exists (for paired tags)
  if (codemod.patternEnd) {
    content = content.replace(codemod.patternEnd, codemod.replaceEnd);
  }

  // Handle import changes
  if (codemod.imports?.add) {
    if (!content.includes(codemod.imports.add.replace(/import .* from /, '').replace(/[';]/g, ''))) {
      // Add import after first import block
      const firstImport = content.indexOf('import ');
      if (firstImport >= 0) {
        const lineEnd = content.indexOf('\n', firstImport);
        content = content.slice(0, lineEnd + 1) + codemod.imports.add + '\n' + content.slice(lineEnd + 1);
      }
    }
  }

  if (dryRun) {
    return { success: true, dryRun: true, changes: matchCount, file: filePath, codemod: codemod.name };
  }

  writeFileSync(filePath, content);
  return { success: true, changes: matchCount, file: filePath, codemod: codemod.name };
}

export function runAllCodemods(filePath, { dryRun = false } = {}) {
  const results = [];
  for (const [name, codemod] of Object.entries(CODEMODS)) {
    const result = runCodemod(filePath, name, { dryRun });
    if (result.changes > 0) results.push(result);
  }
  return results;
}

export function listCodemods() {
  return Object.entries(CODEMODS).map(([id, cm]) => ({ id, name: cm.name }));
}
