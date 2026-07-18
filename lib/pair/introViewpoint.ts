import type { ImageFrame, PairIntro } from '@/lib/types/character';

export type IntroViewpoint = 'A' | 'B';

export type IntroPovFields = {
  first: string;
  now: string;
};

export type IntroPovArt = {
  src?: string;
  frame?: ImageFrame;
  aspectRatio?: string;
  size?: number;
};

/** A는 구버전 firstImpression/now 텍스트 폴백 */
export function resolveIntroPov(
  intro: PairIntro | null | undefined,
  side: IntroViewpoint,
): IntroPovFields {
  if (side === 'A') {
    const hasFirstA = intro?.firstImpressionA != null;
    const hasNowA = intro?.nowA != null;
    return {
      first: hasFirstA
        ? String(intro?.firstImpressionA ?? '').trim()
        : intro?.firstImpression?.trim() || '',
      now: hasNowA ? String(intro?.nowA ?? '').trim() : intro?.now?.trim() || '',
    };
  }
  return {
    first: intro?.firstImpressionB?.trim() || '',
    now: intro?.nowB?.trim() || '',
  };
}

export function hasIntroFirstNow(intro: PairIntro | null | undefined): boolean {
  const a = resolveIntroPov(intro, 'A');
  const b = resolveIntroPov(intro, 'B');
  return !!(a.first || a.now || b.first || b.now);
}

export function isIntroPovArtUnified(intro: PairIntro | null | undefined): boolean {
  return !!intro?.unifyPovImg;
}

function resolveSideArt(
  intro: PairIntro | null | undefined,
  side: IntroViewpoint,
): IntroPovArt {
  if (side === 'A') {
    if (intro?.povImgA != null) {
      return {
        src: intro.povImgA?.trim() || undefined,
        frame: intro.povImgAFrame,
        aspectRatio: intro.povImgAAspect,
        size: intro.povImgASize,
      };
    }
    const first = intro?.firstImgA?.trim() || intro?.firstImg?.trim();
    if (first) {
      return {
        src: first,
        frame: intro?.firstImgA ? intro.firstImgAFrame : intro?.firstImgFrame,
        aspectRatio: intro?.firstImgA ? intro.firstImgAAspect : intro?.firstImgAspect,
        size: intro?.firstImgA ? intro.firstImgASize : intro?.firstImgSize,
      };
    }
    const now = intro?.nowImgA?.trim() || intro?.nowImg?.trim();
    if (now) {
      return {
        src: now,
        frame: intro?.nowImgA ? intro.nowImgAFrame : intro?.nowImgFrame,
        aspectRatio: intro?.nowImgA ? intro.nowImgAAspect : intro?.nowImgAspect,
        size: intro?.nowImgA ? intro.nowImgASize : intro?.nowImgSize,
      };
    }
    return {};
  }

  if (intro?.povImgB != null) {
    return {
      src: intro.povImgB?.trim() || undefined,
      frame: intro.povImgBFrame,
      aspectRatio: intro.povImgBAspect,
      size: intro.povImgBSize,
    };
  }
  if (intro?.firstImgB?.trim()) {
    return {
      src: intro.firstImgB.trim(),
      frame: intro.firstImgBFrame,
      aspectRatio: intro.firstImgBAspect,
      size: intro.firstImgBSize,
    };
  }
  if (intro?.nowImgB?.trim()) {
    return {
      src: intro.nowImgB.trim(),
      frame: intro.nowImgBFrame,
      aspectRatio: intro.nowImgBAspect,
      size: intro.nowImgBSize,
    };
  }
  return {};
}

/**
 * 시점별 일러스트. unifyPovImg면 A/B 동일(있는 쪽 우선).
 */
export function resolveIntroPovArt(
  intro: PairIntro | null | undefined,
  side: IntroViewpoint,
): IntroPovArt {
  if (isIntroPovArtUnified(intro)) {
    const a = resolveSideArt(intro, 'A');
    if (a.src) return a;
    return resolveSideArt(intro, 'B');
  }
  return resolveSideArt(intro, side);
}

export function patchIntroPovText(
  side: IntroViewpoint,
  field: 'first' | 'now',
  value: string,
): Partial<PairIntro> {
  if (side === 'A') {
    return field === 'first'
      ? { firstImpressionA: value, firstImpression: '' }
      : { nowA: value, now: '' };
  }
  return field === 'first' ? { firstImpressionB: value } : { nowB: value };
}

function artPatchForSide(
  side: IntroViewpoint,
  patch: {
    src?: string;
    frame?: ImageFrame;
    aspectRatio?: string;
    size?: number;
  },
): Partial<PairIntro> {
  const src = patch.src || undefined;
  if (side === 'A') {
    return {
      povImgA: src,
      povImgAFrame: patch.frame,
      povImgAAspect: patch.aspectRatio,
      povImgASize: patch.size,
      firstImgA: '',
      nowImgA: '',
      firstImg: '',
      nowImg: '',
    };
  }
  return {
    povImgB: src,
    povImgBFrame: patch.frame,
    povImgBAspect: patch.aspectRatio,
    povImgBSize: patch.size,
    firstImgB: '',
    nowImgB: '',
  };
}

/** 시점 일러스트 — 통일 켜져 있으면 A·B·프레임까지 동일 기록 */
export function patchIntroPovArt(
  intro: PairIntro | null | undefined,
  side: IntroViewpoint,
  patch: {
    src?: string;
    frame?: ImageFrame;
    aspectRatio?: string;
    size?: number;
  },
): Partial<PairIntro> {
  if (isIntroPovArtUnified(intro)) {
    return {
      ...artPatchForSide('A', patch),
      ...artPatchForSide('B', patch),
      unifyPovImg: true,
    };
  }
  return artPatchForSide(side, patch);
}

/** A/B 일러스트 통일 on/off. 켤 때 현재 시점(또는 있는 쪽) 이미지를 양쪽에 복사 */
export function patchIntroPovArtUnify(
  intro: PairIntro | null | undefined,
  side: IntroViewpoint,
  unified: boolean,
): Partial<PairIntro> {
  if (!unified) return { unifyPovImg: false };

  const fromSide = resolveSideArt(intro, side);
  const fallback = fromSide.src ? fromSide : resolveSideArt(intro, side === 'A' ? 'B' : 'A');
  const patch = {
    src: fallback.src,
    frame: fallback.frame,
    aspectRatio: fallback.aspectRatio,
    size: fallback.size,
  };
  return {
    unifyPovImg: true,
    ...artPatchForSide('A', patch),
    ...artPatchForSide('B', patch),
  };
}
