import { NextResponse } from 'next/server';
import { cleanFileName, cleanSegment } from '@/lib/r2/keys';
import { uploadBufferToR2 } from '@/lib/r2/server';

export const runtime = 'nodejs';

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    const uploadToken = process.env.R2_UPLOAD_TOKEN?.trim();
    if (uploadToken) {
      const auth = request.headers.get('authorization') || '';
      const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
      const headerToken = request.headers.get('x-upload-token') || '';
      if (bearer !== uploadToken && headerToken !== uploadToken) {
        return unauthorized();
      }
    }

    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const folder = cleanSegment(String(form.get('folder') || 'lakehouse'), 'lakehouse');
    const fileName = cleanFileName(file.name || 'upload');
    const contentType = file.type || 'application/octet-stream';
    const body = Buffer.from(await file.arrayBuffer());

    const result = await uploadBufferToR2({
      body,
      contentType,
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
