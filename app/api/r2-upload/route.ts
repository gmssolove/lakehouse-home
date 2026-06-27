import { NextResponse } from 'next/server';
import { cleanFileName, cleanSegment } from '@/lib/r2/keys';
import { MAX_IMAGE_UPLOAD_BYTES } from '@/lib/r2/compressImage';
import { guessMimeFromName } from '@/lib/r2/mime';
import { uploadBufferToR2 } from '@/lib/r2/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

function checkUploadAuth(request: Request): NextResponse | null {
  const uploadToken = process.env.R2_UPLOAD_TOKEN?.trim();
  if (!uploadToken) return null;
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const headerToken = request.headers.get('x-upload-token') || '';
  if (bearer !== uploadToken && headerToken !== uploadToken) {
    return unauthorized();
  }
  return null;
}

async function uploadRawBody(request: Request) {
  const contentType = request.headers.get('content-type')?.trim() || 'application/octet-stream';
  if (!contentType.startsWith('image/') && !contentType.startsWith('audio/')) {
    return NextResponse.json({ error: 'only image/audio uploads are allowed' }, { status: 415 });
  }

  const folder = cleanSegment(request.headers.get('x-folder'), 'lakehouse');
  const rawName = request.headers.get('x-file-name');
  const fileName = cleanFileName(rawName ? decodeURIComponent(rawName) : 'upload');
  const body = Buffer.from(await request.arrayBuffer());

  if (contentType.startsWith('image/') && body.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `image too large (max ${Math.round(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024))}MB)` },
      { status: 413 },
    );
  }

  const result = await uploadBufferToR2({
    body,
    contentType,
    fileName,
    folder,
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  try {
    const authFail = checkUploadAuth(request);
    if (authFail) return authFail;

    const contentType = request.headers.get('content-type') || '';
    const isMultipart = contentType.includes('multipart/form-data');
    const isRawMedia = contentType.startsWith('image/') || contentType.startsWith('audio/');

    if (!isMultipart && isRawMedia) {
      return await uploadRawBody(request);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'multipart parse failed';
      return NextResponse.json(
        {
          error:
            message.includes('FormData') || message.includes('boundary')
              ? 'multipart 파싱 실패. 파일명을 영문으로 바꾸거나 다시 시도해 주세요.'
              : message,
        },
        { status: 400 },
      );
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const folder = cleanSegment(String(form.get('folder') || 'lakehouse'), 'lakehouse');
    const fileName = cleanFileName(file.name || 'upload');
    const guessed = guessMimeFromName(fileName);
    const fileType =
      file.type?.trim() ||
      guessed ||
      (folder.includes('music') || folder.includes('bgm') ? 'audio/mpeg' : 'application/octet-stream');
    const body = Buffer.from(await file.arrayBuffer());

    const result = await uploadBufferToR2({
      body,
      contentType: fileType,
      fileName,
      folder,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upload failed';
    const status =
      message.includes('too large') ? 413 :
      message.includes('only image/audio') ? 415 :
      message.includes('Missing environment') ? 500 :
      500;

    return NextResponse.json({ error: message }, { status });
  }
}
