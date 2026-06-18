const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-File-Name,X-Folder,X-Upload-Token',
  'Access-Control-Max-Age': '86400'
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function cleanSegment(value, fallback) {
  const text = String(value || fallback || 'upload')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/');
  return text || fallback || 'upload';
}

function cleanMetadataValue(value) {
  const ascii = String(value || 'upload')
    .replace(/[^\x20-\x7E]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return ascii || 'upload';
}

function cleanFileName(value) {
  const decoded = decodeURIComponent(String(value || 'image'));
  const name = decoded.split(/[\\/]/).pop() || 'image';
  return name.replace(/[^a-zA-Z0-9가-힣._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
}

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('X-Upload-Token') || '';
}

function publicUrl(env, request, key) {
  const base = String(env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (base) return `${base}/${key}`;
  const url = new URL(request.url);
  return `${url.origin}/file/${key}`;
}

async function serveFile(request, env) {
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/file\//, ''));
  if (!key) return json({ error: 'missing key' }, 400);
  const object = await env.R2_BUCKET.get(key);
  if (!object) return json({ error: 'not found' }, 404);
  const headers = new Headers(CORS_HEADERS);
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}

async function upload(request, env) {
  if (!env.R2_BUCKET) return json({ error: 'R2_BUCKET binding is missing' }, 500);
  if (env.UPLOAD_TOKEN && bearerToken(request) !== env.UPLOAD_TOKEN) {
    return json({ error: 'unauthorized' }, 401);
  }

  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
  if (!contentType.startsWith('image/') && !contentType.startsWith('audio/')) {
    return json({ error: 'only image/audio uploads are allowed' }, 415);
  }

  const folder = cleanSegment(request.headers.get('X-Folder'), 'lakehouse');
  const fileName = cleanFileName(request.headers.get('X-File-Name'));
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}-${fileName}`;
  const putOptions = {
    httpMetadata: { contentType },
    customMetadata: { originalName: cleanMetadataValue(fileName) }
  };

  if (contentType.startsWith('image/')) {
    const declared = Number(request.headers.get('Content-Length') || 0);
    if (declared > MAX_IMAGE_BYTES) {
      return json({ error: 'image too large (max 10MB)' }, 413);
    }
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_IMAGE_BYTES) {
      return json({ error: 'image too large (max 10MB)' }, 413);
    }
    await env.R2_BUCKET.put(key, body, putOptions);
  } else {
    await env.R2_BUCKET.put(key, request.body, putOptions);
  }

  return json({ ok: true, key, url: publicUrl(env, request, key) });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.startsWith('/file/')) return serveFile(request, env);
    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/upload')) return upload(request, env);
    return json({ ok: true, usage: 'POST /upload with an image/audio body. GET /file/:key serves private R2 objects.' });
  }
};