import { sanitizeUploadFileName } from '@/lib/r2/mime';

/** Worker/API 공통 이미지 상한 */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

/** 압축 목표 (여유 버퍼) */
export const MAX_IMAGE_UPLOAD_TARGET = 9.5 * 1024 * 1024;

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

export function isCompressibleImageFile(file: File): boolean {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return false;
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name);
}

function loadViaImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽을 수 없습니다.'));
    };
    img.src = url;
  });
}

async function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/**
 * 10MB 초과 이미지는 업로드 전 JPEG로 리사이즈·압축합니다.
 */
export async function compressImageFileForUpload(file: File): Promise<File> {
  if (!isCompressibleImageFile(file)) return file;
  if (file.size <= MAX_IMAGE_UPLOAD_TARGET) return file;
  if (typeof document === 'undefined') return file;

  const img = await loadViaImage(file);
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  if (!width || !height) return file;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  let quality = 0.9;
  let scale = 1;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    blob = await toJpegBlob(canvas, quality);
    if (blob && blob.size <= MAX_IMAGE_UPLOAD_TARGET) {
      const stem = sanitizeUploadFileName(file.name.replace(/\.[^.]+$/, '') || 'upload');
      return new File([blob], `${stem}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    }

    if (quality > 0.45) {
      quality -= 0.08;
    } else {
      scale *= 0.85;
      quality = 0.82;
    }
  }

  if (blob && blob.size < file.size) {
    const stem = sanitizeUploadFileName(file.name.replace(/\.[^.]+$/, '') || 'upload');
    return new File([blob], `${stem}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  }

  throw new Error(
    `이미지가 너무 큽니다 (최대 ${Math.round(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024))}MB). 다른 파일을 사용해 주세요.`,
  );
}
