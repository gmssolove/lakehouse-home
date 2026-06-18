import type { GalleryItem } from '@/lib/types/character';

export function normalizeGalleryItem(item: string | GalleryItem): GalleryItem {
  if (typeof item === 'string') return { src: item };
  return { src: item.src || '', credit: item.credit };
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
