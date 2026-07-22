import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VnSceneResolver } from '@/components/vn/VnSceneResolver';
import { getVNScene, VN_SCENE_LIST } from '@/data/vn/scenes';

type Props = {
  params: Promise<{ sceneId: string }>;
};

export function generateStaticParams() {
  return VN_SCENE_LIST.map((s) => ({ sceneId: s.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sceneId } = await params;
  const scene = getVNScene(sceneId);
  if (scene) {
    return { title: `${scene.title} | lakehouse VN` };
  }
  return { title: `시나리오 VN | lakehouse` };
}

/** 정적 씬 + TRPG Firebase vnScene 둘 다 지원 (클라이언트에서 해석) */
export default async function VnScenePage({ params }: Props) {
  const { sceneId } = await params;
  return (
    <Suspense fallback={null}>
      <VnSceneResolver sceneId={sceneId} />
    </Suspense>
  );
}
