import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

try {
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: `oc/gallery/test-${Date.now()}.txt`,
      Body: 'hello',
      ContentType: 'text/plain',
    }),
  );
  console.log('S3 upload OK');
} catch (e) {
  console.error('S3 upload failed:', e.name, e.message);
  console.error('httpStatusCode:', e.$metadata?.httpStatusCode);
}
