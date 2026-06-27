import { formatGalleryCredit, normalizeGallery } from '@/lib/oc/gallery';
import { uploadImageUrl, waitR2Pending } from '@/lib/r2/client';
import { stripEmptyThemeFields } from '@/lib/oc/characterTheme';
import type { GalleryItem, OcCharacter } from '@/lib/types/character';

async function prepareGallery(items: (string | GalleryItem)[]): Promise<GalleryItem[]> {
  const rows = normalizeGallery(items);
  const out: GalleryItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    const src = await uploadImageUrl(item.src, 'oc/gallery', `gallery-${i + 1}.png`);
    const credit = item.credit?.trim();
    out.push(credit ? { src, credit: formatGalleryCredit(credit) } : { src });
  }
  return out;
}

/** Firebase 저장 전 data URL을 R2 URL로 올리고 갤러리 형식을 정리합니다. */
export async function prepareCharacterForSave(character: OcCharacter): Promise<OcCharacter> {
  await waitR2Pending();

  const next: OcCharacter = { ...character };

  if (next.img?.trim()) {
    next.img = await uploadImageUrl(next.img, 'oc/main', `${character.name || 'char'}-main.png`);
  }

  if (next.gallery?.length) {
    next.gallery = await prepareGallery(next.gallery);
  }

  if (next.auVersions?.length) {
    next.auVersions = await Promise.all(
      next.auVersions.map(async (au, i) => {
        if (!au.img?.trim()) return au;
        return {
          ...au,
          img: await uploadImageUrl(au.img, 'oc/au', `${character.name || 'char'}-au-${i + 1}.png`),
        };
      }),
    );
  }

  if (next.theme?.fileData?.trim()) {
    next.theme = {
      ...next.theme,
      fileData: await uploadImageUrl(
        next.theme.fileData,
        'oc/theme',
        `${character.name || 'char'}-theme`,
      ),
    };
  }

  if (next.dialogue?.length) {
    next.dialogue = await Promise.all(
      next.dialogue.map(async (node, i) => {
        if (!node.expression?.trim()) return node;
        return {
          ...node,
          expression: await uploadImageUrl(node.expression, 'oc/expression', `dlg-${node.id || i + 1}.png`),
        };
      }),
    );
  }

  return stripEmptyThemeFields(next);
}

export async function prepareCharactersForSave(characters: OcCharacter[]): Promise<OcCharacter[]> {
  const out: OcCharacter[] = [];
  for (const character of characters) {
    out.push(await prepareCharacterForSave(character));
  }
  return out;
}
