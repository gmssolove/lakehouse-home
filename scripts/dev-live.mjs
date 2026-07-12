#!/usr/bin/env node
/**
 * 로컬 실시간 미리보기 서버 기동 + 브라우저 자동 열기
 * 사용: npm run dev:live
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.env.PORT || 3004);
const HOST = process.env.HOST || '0.0.0.0';
const URL = `http://127.0.0.1:${PORT}`;

function lanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

function openBrowser(target) {
  const platform = process.platform;
  const cmd = platform === 'win32' ? 'start' : platform === 'darwin' ? 'open' : 'xdg-open';
  const child =
    platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' })
      : spawn(cmd, [target], { detached: true, stdio: 'ignore' });
  child.unref();
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

console.log('');
console.log('  lakehouse — 실시간 미리보기');
console.log('  ─────────────────────────────');
console.log(`  로컬   ${URL}`);
const ip = lanIp();
if (ip) console.log(`  LAN    http://${ip}:${PORT}`);
console.log('  저장하면 브라우저에 자동 반영됩니다.');
console.log('');

const child = spawn(process.execPath, [nextBin, 'dev', '--turbo', '--hostname', HOST, '-p', String(PORT)], {
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
});

let opened = false;
const openTimer = setTimeout(() => {
  if (!opened) {
    opened = true;
    openBrowser(URL);
  }
}, 2800);

child.on('exit', (code) => {
  clearTimeout(openTimer);
  process.exit(code ?? 0);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
