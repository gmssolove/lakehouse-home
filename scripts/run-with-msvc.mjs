/**
 * MSVC 환경(vcvars64)을 잡은 뒤 인자로 받은 명령을 실행.
 * Windows + Tauri / Cargo 용.
 */
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

const candidates = [
  process.env['ProgramFiles(x86)'],
  process.env.ProgramFiles,
]
  .filter(Boolean)
  .flatMap((root) => [
    path.join(root, 'Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat'),
    path.join(root, 'Microsoft Visual Studio/2022/Community/VC/Auxiliary/Build/vcvars64.bat'),
    path.join(root, 'Microsoft Visual Studio/2022/Professional/VC/Auxiliary/Build/vcvars64.bat'),
    path.join(root, 'Microsoft Visual Studio/18/BuildTools/VC/Auxiliary/Build/vcvars64.bat'),
  ]);

async function findVcvars() {
  for (const p of candidates) {
    try {
      await access(p);
      return p;
    } catch {
      /* next */
    }
  }
  return null;
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error('usage: node scripts/run-with-msvc.mjs <cmd> [args…]');
  process.exit(1);
}

const vcvars = await findVcvars();
const inner = args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');

if (!vcvars) {
  console.warn('[msvc] vcvars64.bat not found — running without MSVC env');
  const child = spawn(args[0], args.slice(1), { stdio: 'inherit', shell: true });
  child.on('exit', (c) => process.exit(c ?? 1));
} else {
  console.log('[msvc] using', vcvars);
  const cmd = `call "${vcvars}" && ${inner}`;
  const child = spawn(cmd, { stdio: 'inherit', shell: true, env: process.env });
  child.on('exit', (c) => process.exit(c ?? 1));
}
