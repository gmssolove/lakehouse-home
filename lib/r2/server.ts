import { MAX_IMAGE_UPLOAD_BYTES } from '@/lib/r2/compressImage';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { buildObjectKey, buildPublicUrl, cleanMetadataValue } from '@/lib/r2/keys';

const MAX_IMAGE_BYTES = MAX_IMAGE_UPLOAD_BYTES;

let s3Client: S3Client | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  const accountId = requireEnv('R2_ACCOUNT_ID');
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });

  return s3Client;
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

  const bucket = requireEnv('R2_BUCKET_NAME');
  const key = buildObjectKey(folder, fileName);
  const client = getS3Client();

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: {
          originalname: cleanMetadataValue(fileName),
        },
      }),
    );
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const message = err instanceof Error ? err.message : '';
    if (name === 'Unauthorized' || /unauthorized/i.test(message)) {
      throw new Error(
        'R2 인증 실패: .env.local의 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY가 만료되었거나 잘못되었습니다. Cloudflare 대시보드 → R2 → Manage R2 API tokens에서 새 토큰을 발급한 뒤 npm run r2:env 로 갱신하세요.',
      );
    }
    throw err;
  }

  const publicBase =
    process.env.R2_PUBLIC_BASE_URL?.trim() ||
    'https://lakehouse-r2-upload.gmssolove.workers.dev/file';
  const url = buildPublicUrl(key, publicBase);

  return { key, url };
}
