import type { GalleryItem } from '@/lib/types/character';

export function formatGalleryCredit(credit?: string): string {
  const raw = credit?.trim().replace(/^©+\s*/g, '') ?? '';
  return raw ? `© ${raw}` : '';
}

export function galleryCreditDisplay(credit?: string): string {
  return credit?.trim().replace(/^©+\s*/g, '') ?? '';
}

export function normalizeGalleryItem(item: string | GalleryItem): GalleryItem {
  if (typeof item === 'string') return { src: item };
  const src = item.src || '';
  const credit = item.credit?.trim() ? formatGalleryCredit(item.credit) : undefined;
  return credit ? { src, credit } : { src };
}

export function normalizeGallery(gallery?: (string | GalleryItem)[]): GalleryItem[] {
  return (gallery || []).map(normalizeGalleryItem).filter((item) => item.src.trim());
}

export function gallerySrc(item: string | GalleryItem): string {
  return typeof item === 'string' ? item : item.src;
}

export function galleryCredit(item: string | GalleryItem): string {
  return typeof item === 'string' ? '' : item.credit?.trim() || '';
}
