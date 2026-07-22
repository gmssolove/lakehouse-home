'use client';

/**
 * 업로드 캐릭터 이미지의 투명 여백을 잘라내고, 세로/가로 비율로 초기 스케일을 추천한다.
 */
export type TrimResult = {
  file: File;
  /** 트리밍된 내용의 세로/가로 비율 — 전신 스탠딩 판별용 */
  aspectRatio: number;
};

export async function trimTransparentEdges(file: File): Promise<TrimResult> {
  if (typeof document === 'undefined') return { file, aspectRatio: 0 };

  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { file, aspectRatio: img.naturalHeight / img.naturalWidth };

  ctx.drawImage(img, 0, 0);

  let bounds: { top: number; bottom: number; left: number; right: number };
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    bounds = findContentBounds(imageData);
  } catch {
    return { file, aspectRatio: img.naturalHeight / img.naturalWidth };
  }

  const w = bounds.right - bounds.left + 1;
  const h = bounds.bottom - bounds.top + 1;
  if (w <= 0 || h <= 0) {
    return { file, aspectRatio: img.naturalHeight / img.naturalWidth };
  }
  const aspectRatio = h / w;

  if (w === canvas.width && h === canvas.height) {
    return { file, aspectRatio };
  }

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const outCtx = out.getContext('2d');
  if (!outCtx) return { file, aspectRatio };
  outCtx.drawImage(canvas, bounds.left, bounds.top, w, h, 0, 0, w, h);

  const blob: Blob | null = await new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
  if (!blob) return { file, aspectRatio };

  const trimmedFile = new File([blob], file.name.replace(/\.\w+$/, '') + '_trimmed.png', {
    type: 'image/png',
  });
  return { file: trimmedFile, aspectRatio };
}

/** 세로/가로 비율로 전신·상반신을 추정해 초기 scale 추천 */
export function suggestInitialScale(aspectRatio: number): number {
  if (!aspectRatio) return 1;
  if (aspectRatio >= 2.2) return 1;
  if (aspectRatio >= 1.7) return 0.75;
  return 0.5;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function findContentBounds(imageData: ImageData, alphaThreshold = 10) {
  const { data, width, height } = imageData;
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;

  topLoop: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        top = y;
        break topLoop;
      }
    }
  }
  bottomLoop: for (let y = height - 1; y >= top; y--) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        bottom = y;
        break bottomLoop;
      }
    }
  }
  leftLoop: for (let x = 0; x < width; x++) {
    for (let y = top; y <= bottom; y++) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        left = x;
        break leftLoop;
      }
    }
  }
  rightLoop: for (let x = width - 1; x >= left; x--) {
    for (let y = top; y <= bottom; y++) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        right = x;
        break rightLoop;
      }
    }
  }

  return { top, bottom, left, right };
}
