/** 비밀글 — scope 기본 비밀번호 또는 항목별 override */
export type WithSecret = {
  secret?: boolean;
  /** 비어 있으면 scope 기본 비밀번호 사용 */
  secretPassword?: string;
};

export type LakeAccessScope =
  | 'oc'
  | 'pair'
  | 'trpg'
  | 'diary'
  | 'scrap'
  | 'review'
  | 'music'
  | 'charArchive'
  | 'notice'
  | 'gallery'
  | 'quote'
  | 'guest';

export type SiteAccessSettings = Record<LakeAccessScope, string>;

export const DEFAULT_SITE_ACCESS_SETTINGS: SiteAccessSettings = {
  oc: '1145',
  pair: '1145',
  trpg: '1145',
  diary: '',
  scrap: '',
  review: '',
  music: '',
  charArchive: '',
  notice: '',
  gallery: '',
  quote: '',
  guest: '',
};
