import { AwsClient } from 'aws4fetch';
import { MAX_IMAGE_UPLOAD_BYTES } from '@/lib/r2/compressImage';
import { buildObjectKey, buildPublicUrl, cleanMetadataValue } from '@/lib/r2/keys';

const MAX_IMAGE_BYTES = MAX_IMAGE_UPLOAD_BYTES;

let awsClient: AwsClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getAwsClient(): AwsClient {
  if (awsClient) return awsClient;
  awsClient = new AwsClient({
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    service: 's3',
    region: 'auto',
  });
  return awsClient;
}

export function isAllowedUploadType(contentType: string): boolean {
  return contentType.startsWith('image/') || contentType.startsWith('audio/');
}

export async function uploadBufferToR2(input: {
  body: Buffer;
  contentType: string;
  fileName: string;
  folder: string;
}): Promise<{ key: string; url: string }> {
  const { body, contentType, fileName, folder } = input;

  if (!isAllowedUploadType(contentType)) {
    throw new Error('only image/audio uploads are allowed');
  }

  if (contentType.startsWith('image/') && body.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('image too large (max 10MB)');
  }

  const accountId = requireEnv('R2_ACCOUNT_ID');
  const bucket = requireEnv('R2_BUCKET_NAME');
  const key = buildObjectKey(folder, fileName);
  const path = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${path}`;

  try {
    const res = await getAwsClient().fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'x-amz-meta-originalname': cleanMetadataValue(fileName),
      },
      body: new Uint8Array(body),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401 || res.status === 403 || /unauthorized/i.test(text)) {
        throw new Error(
          'R2 인증 실패: .env.local의 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY가 만료되었거나 잘못되었습니다. Cloudflare 대시보드 → R2 → Manage R2 API tokens에서 새 토큰을 발급한 뒤 npm run r2:env 로 갱신하세요.',
        );
      }
      throw new Error(`R2 put failed: ${res.status} ${text}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/R2 인증 실패/.test(message)) throw err;
    if (/unauthorized/i.test(message)) {
      throw new Error(
        'R2 인증 실패: .env.local의 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY가 만료되었거나 잘못되었습니다. Cloudflare 대시보드 → R2 → Manage R2 API tokens에서 새 토큰을 발급한 뒤 npm run r2:env 로 갱신하세요.',
      );
    }
    throw err;
  }

  const publicBase =
    process.env.R2_PUBLIC_BASE_URL?.trim() ||
    'https://lakehouse-r2-upload.gmssolove.workers.dev/file';
  return { key, url: buildPublicUrl(key, publicBase) };
}
