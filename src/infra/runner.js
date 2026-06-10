import { execSync } from 'node:child_process';

export function run(command, cwd, { timeout = 120000, silent = false } = {}) {
  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf8',
      timeout,
      stdio: silent ? 'pipe' : 'inherit',
    });
    return { success: true, output: output || '' };
  } catch (err) {
    return {
      success: false,
      output: err.stdout || '',
      error: err.stderr || err.message,
      exitCode: err.status,
    };
  }
}

export async function runWithRollback(actions, rollbackActions, cwd) {
  const completed = [];
  for (const action of actions) {
    const result = run(action.command, cwd, action.options);
    if (!result.success) {
      console.error(`\n⚠️  Failed: ${action.label || action.command}`);
      console.error(`   Rolling back ${completed.length} action(s)...`);
      for (const rb of rollbackActions.slice(0, completed.length).reverse()) {
        run(rb.command, cwd, { silent: true });
      }
      return { success: false, failedAt: action.label, error: result.error };
    }
    completed.push(action);
    if (action.label) console.log(`   ✓ ${action.label}`);
  }
  return { success: true, completedCount: completed.length };
}
