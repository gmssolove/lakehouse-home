import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNT_ID = 'd47331fa71b913d9497c2ede130ab0fb';
const BUCKET = 'lakehouse-images';
const OLD_ACCESS_KEY_ID = '104d1f22f95357a39bbbf7460eab482f';
const BUCKET_RESOURCE = `com.cloudflare.edge.r2.bucket.${ACCOUNT_ID}_default_${BUCKET}`;
const R2_WRITE_PERM = '2efd5506f9c8494dacb1fa10a3e7d5b6';

function wranglerToken() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const paths = [
    resolve(home, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml'),
    resolve(home, '.wrangler/config/default.toml'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return process.env.CLOUDFLARE_API_TOKEN || '';
}

async function cf(path, init = {}) {
  const token = wranglerToken();
  if (!token) throw new Error('Cloudflare API token not found. Run: npx wrangler login');
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const data = await res.json();
  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join('; ') || res.statusText;
    throw new Error(msg);
  }
  return data;
}

async function deleteOldToken() {
  try {
    await cf(`/accounts/${ACCOUNT_ID}/tokens/${OLD_ACCESS_KEY_ID}`, { method: 'DELETE' });
    console.log('Deleted old token:', OLD_ACCESS_KEY_ID);
  } catch (err) {
    console.warn('Could not delete old token (may already be removed):', err.message);
  }
}

async function createToken() {
  const body = {
    name: `lakehouse-next-upload-${new Date().toISOString().slice(0, 10)}`,
    policies: [
      {
        effect: 'allow',
        resources: { [BUCKET_RESOURCE]: '*' },
        permission_groups: [
          { id: R2_WRITE_PERM, name: 'Workers R2 Storage Bucket Item Write' },
        ],
      },
    ],
  };

  const data = await cf(`/accounts/${ACCOUNT_ID}/tokens`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const token = data.result;
  const accessKeyId = token.id;
  const secretAccessKey = createHash('sha256').update(token.value, 'utf8').digest('hex');

  return { accessKeyId, secretAccessKey };
}

function updateEnvLocal(accessKeyId, secretAccessKey) {
  const envPath = resolve(process.cwd(), '.env.local');
  const lines = [
    `R2_ACCOUNT_ID=${ACCOUNT_ID}`,
    `R2_ACCESS_KEY_ID=${accessKeyId}`,
    `R2_SECRET_ACCESS_KEY=${secretAccessKey}`,
    `R2_BUCKET_NAME=${BUCKET}`,
    'R2_PUBLIC_BASE_URL=https://lakehouse-r2-upload.gmssolove.workers.dev/file',
    '',
  ];
  writeFileSync(envPath, lines.join('\n'), 'utf8');
  console.log('Updated', envPath);
}

async function main() {
  await deleteOldToken();
  const creds = await createToken();
  updateEnvLocal(creds.accessKeyId, creds.secretAccessKey);
  console.log('New Access Key ID:', creds.accessKeyId);
  console.log('Rotation complete. Restart: npm run dev');
}

main().catch((err) => {
  console.error('Rotation failed:', err.message);
  process.exit(1);
});
