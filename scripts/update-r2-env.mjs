import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNT_ID = 'd47331fa71b913d9497c2ede130ab0fb';
const BUCKET = 'lakehouse-images';
const PUBLIC_BASE = 'https://lakehouse-r2-upload.gmssolove.workers.dev/file';

function readArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : '';
}

const accessKeyId = readArg('access-key') || process.env.R2_ACCESS_KEY_ID || '';
const secretAccessKey = readArg('secret-key') || process.env.R2_SECRET_ACCESS_KEY || '';

if (!accessKeyId || !secretAccessKey) {
  console.error(`Usage:
  node scripts/update-r2-env.mjs --access-key=... --secret-key=...

Or:
  set R2_ACCESS_KEY_ID=...
  set R2_SECRET_ACCESS_KEY=...
  node scripts/update-r2-env.mjs`);
  process.exit(1);
}

const envPath = resolve(process.cwd(), '.env.local');
const body = [
  `R2_ACCOUNT_ID=${ACCOUNT_ID}`,
  `R2_ACCESS_KEY_ID=${accessKeyId}`,
  `R2_SECRET_ACCESS_KEY=${secretAccessKey}`,
  `R2_BUCKET_NAME=${BUCKET}`,
  `R2_PUBLIC_BASE_URL=${PUBLIC_BASE}`,
  '',
].join('\n');

writeFileSync(envPath, body, 'utf8');
console.log(`Updated ${envPath}`);
console.log('Restart dev server: npm run dev');
