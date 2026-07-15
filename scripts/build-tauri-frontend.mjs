/**
 * Tauri 프로덕션 프론트엔드 준비
 * - output: 'export' + trailingSlash
 * - HTML 내 /_next|favicon 절대경로 → 상대경로로 보정 (커스텀 프로토콜 404 방지)
 * - 진입점: out/index.html (VN test_scene 내용을 루트에 배치)
 */
import { spawnSync } from 'node:child_process';
import { cp, access, rename, rm, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const apiDir = path.join(root, 'app', 'api');
const apiBak = path.join(root, 'app', '_api.tauri.bak');
const mwFile = path.join(root, 'middleware.ts');
const mwBak = path.join(root, 'middleware.ts.tauri.bak');
const outDir = path.join(root, 'out');
const distDir = path.join(root, '.tauri-frontend');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function park(src, bak) {
  if (!(await exists(src))) return false;
  if (await exists(bak)) await rm(bak, { recursive: true, force: true });
  try {
    await rename(src, bak);
  } catch {
    /* Windows 잠금 시 rename 실패 → 복사 후 삭제 */
    await cp(src, bak, { recursive: true });
    await rm(src, { recursive: true, force: true });
  }
  return true;
}

async function restore(src, bak) {
  if (!(await exists(bak))) return;
  if (await exists(src)) await rm(src, { recursive: true, force: true });
  await rename(bak, src);
}

/** out/foo/bar/index.html → depth 2 → ../../ */
function depthFromOut(filePath) {
  const rel = path.relative(outDir, path.dirname(filePath)).replace(/\\/g, '/');
  if (!rel || rel === '.') return 0;
  return rel.split('/').filter(Boolean).length;
}

function relativizeHtml(html, depth) {
  const prefix = depth <= 0 ? './' : '../'.repeat(depth);
  return (
    html
      /* src="/_next/..." href="/_next/..." */
      .replace(/(src|href)=["']\/(_next\/)/g, `$1="${prefix}$2`)
      .replace(/(src|href)=["']\/(favicon[^"']*)/g, `$1="${prefix}$2`)
      /* RSC / flight / modulepreload JSON blobs */
      .replace(/"\/_next\//g, `"${prefix}_next/`)
      .replace(/'\/_next\//g, `'${prefix}_next/`)
  );
}

async function walkHtml(dir, files = []) {
  const entries = await readdir(dir);
  for (const name of entries) {
    const full = path.join(dir, name);
    const st = await stat(full);
    if (st.isDirectory()) await walkHtml(full, files);
    else if (name.endsWith('.html')) files.push(full);
  }
  return files;
}

async function relativizeAllHtml() {
  const files = await walkHtml(outDir);
  for (const file of files) {
    const depth = depthFromOut(file);
    const raw = await readFile(file, 'utf8');
    const next = relativizeHtml(raw, depth);
    if (next !== raw) await writeFile(file, next, 'utf8');
  }
  console.log(`[build:tauri] relativized ${files.length} html file(s)`);
}

async function main() {
  const movedApi = await park(apiDir, apiBak);
  const movedMw = await park(mwFile, mwBak);
  if (movedApi) console.log('[build:tauri] parked app/api');
  if (movedMw) console.log('[build:tauri] parked middleware.ts');

  try {
    const result = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['next', 'build'],
      {
        cwd: root,
        env: { ...process.env, TAURI_BUILD: '1' },
        stdio: 'inherit',
        shell: true,
      },
    );
    if (result.status !== 0) {
      throw new Error(`next build failed with code ${result.status}`);
    }

    if (!(await exists(outDir))) {
      throw new Error('out/ missing after next build');
    }

    await relativizeAllHtml();

    /* 루트 index.html = VN 메인 메뉴 (/vn) */
    const menuEntry = path.join(outDir, 'vn', 'index.html');
    const sceneEntry = path.join(outDir, 'vn', 'test_scene', 'index.html');
    const entry = (await exists(menuEntry)) ? menuEntry : sceneEntry;
    if (await exists(entry)) {
      let html = await readFile(entry, 'utf8');
      /* depth1(../_next) 또는 depth2 → 루트용 (./_next) */
      html = html.replace(/(?:\.\.\/)+_next\//g, './_next/');
      html = html.replace(/(?:\.\.\/)+favicon/g, './favicon');
      await writeFile(path.join(outDir, 'index.html'), html, 'utf8');
      console.log('[build:tauri] wrote out/index.html from', path.relative(outDir, entry));
    }

    await rm(distDir, { recursive: true, force: true });
    await cp(outDir, distDir, { recursive: true });
    console.log('[build:tauri] copied out → .tauri-frontend');
  } finally {
    await restore(apiDir, apiBak);
    await restore(mwFile, mwBak);
    if (movedApi) console.log('[build:tauri] restored app/api');
    if (movedMw) console.log('[build:tauri] restored middleware.ts');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
