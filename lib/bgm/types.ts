export type BgmKind = 'url' | 'youtube' | 'file';

export type BgmTrack = {
  kind: BgmKind;
  id: string;
  title: string;
  artist: string;
  scope: 'page' | 'character';
};
