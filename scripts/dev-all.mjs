#!/usr/bin/env node
/** 同时启动本地 API（8787）与 Vite 前端（5173）。 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

function run(command, args, name) {
  const child = spawn(command, args, { stdio: 'inherit', cwd: ROOT, env: process.env });
  child.on('exit', (code) => {
    if (code !== 0) console.log(`[${name}] 退出，代码 ${code}`);
    shutdown();
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run(process.execPath, ['scripts/dev-server.mjs'], 'api');
run('npm', ['run', 'dev', '-w', 'apps/web'], 'web');
