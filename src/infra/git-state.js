import { execSync } from 'node:child_process';

export function isGitRepo(projectPath) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: projectPath, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function isGitClean(projectPath) {
  try {
    const status = execSync('git status --porcelain', { cwd: projectPath, encoding: 'utf8' });
    return status.trim() === '';
  } catch {
    return false;
  }
}

export function gitStash(projectPath) {
  execSync('git stash push -m "dep-doctor: auto-stash before fix"', {
    cwd: projectPath, stdio: 'pipe',
  });
}

export function gitStashPop(projectPath) {
  try {
    execSync('git stash pop', { cwd: projectPath, stdio: 'pipe' });
  } catch { /* stash may be empty */ }
}

export function gitDiff(projectPath, files = []) {
  const fileArgs = files.length ? `-- ${files.join(' ')}` : '';
  return execSync(`git diff ${fileArgs}`, { cwd: projectPath, encoding: 'utf8' });
}

export function gitCheckoutFiles(projectPath, files) {
  if (!files.length) return;
  execSync(`git checkout -- ${files.join(' ')}`, { cwd: projectPath, stdio: 'pipe' });
}
