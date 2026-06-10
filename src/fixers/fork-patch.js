import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function generateForkPatchGuide(packageName, issues, outputDir, { dryRun = false } = {}) {
  const guide = `# Fork-Patch Guide: ${packageName}

## Why Fork?

${packageName} is unmaintained and has ${issues.length} issue(s) that cannot be resolved
through adapter or override strategies.

## Steps

### 1. Fork the Package

\`\`\`bash
# On GitHub: fork the repo
# Clone your fork
git clone https://github.com/YOUR_ORG/${packageName.replace('@', '').replace('/', '-')}.git
cd ${packageName.replace('@', '').replace('/', '-')}
\`\`\`

### 2. Apply Fixes

${issues.map((issue, i) => `#### Fix ${i + 1}: ${issue.api || issue.title || 'Issue'}
- **File**: ${issue.file || 'TBD'}
- **Change**: ${issue.replacement || 'See details'}
`).join('\n')}

### 3. Publish to Internal Registry

\`\`\`bash
# Update package.json name to @yourorg/${packageName.replace('@', '').replace('/', '-')}
npm publish --registry=https://your-registry.example.com
\`\`\`

### 4. Update Consumer

\`\`\`json
// package.json
{
  "dependencies": {
    "${packageName}": "npm:@yourorg/${packageName.replace('@', '').replace('/', '-')}@^1.0.0"
  }
}
\`\`\`

### 5. Verify

\`\`\`bash
npm install
npm test
\`\`\`

## Risk Assessment

- **Maintenance burden**: You now own this fork
- **Upstream merge**: If original package gets maintained, merge upstream changes
- **Exit strategy**: Plan to replace with official package or alternative
`;

  const guidePath = join(outputDir, `fork-patch-${packageName.replace(/[@/]/g, '-')}.md`);

  if (dryRun) {
    return { success: true, dryRun: true, file: guidePath };
  }

  try {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(guidePath, guide);
  } catch (err) {
    return { success: false, error: `Failed to write fork-patch guide: ${err.message}` };
  }
  return { success: true, file: guidePath };
}
