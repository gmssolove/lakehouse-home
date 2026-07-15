/**
 * tauri:dev 용 — 이미 127.0.0.1:3004 에 Next가 있으면 그대로 쓰고,
 * 없으면 npm run dev 를 띄운 뒤 프로세스를 유지한다.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';

const DEV_URL = 'http://127.0.0.1:3004/vn';

function isUp() {
  return new Promise((resolve) => {
    const req = http.get(DEV_URL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

if (await isUp()) {
  console.log(`[tauri] Next already running → ${DEV_URL}`);
  /* beforeDevCommand 가 바로 죽지 않도록 keep-alive */
  setInterval(() => {}, 1 << 30);
} else {
  console.log('[tauri] starting npm run dev…');
  const child = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}
