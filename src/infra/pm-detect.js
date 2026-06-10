import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function detectPackageManager(projectPath) {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(projectPath, 'package-lock.json'))) return 'npm';
  return 'npm'; // default
}

export function getInstallCommand(pm) {
  return { npm: 'npm install', pnpm: 'pnpm install', yarn: 'yarn install' }[pm];
}

export function getRunTestCommand(pm) {
  return { npm: 'npm test', pnpm: 'pnpm test', yarn: 'yarn test' }[pm];
}

export function getLockfileName(pm) {
  return {
    npm: 'package-lock.json',
    pnpm: 'pnpm-lock.yaml',
    yarn: 'yarn.lock',
  }[pm];
}
