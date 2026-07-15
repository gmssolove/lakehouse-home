import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getVNScene, VN_SCENE_LIST, VN_SCENES } from '@/data/vn/scenes';
import { VnSceneClient } from '@/components/vn/VnSceneClient';
import { VnSceneMissing } from '@/components/vn/VnSceneMissing';

type Props = {
  params: Promise<{ sceneId: string }>;
};

export function generateStaticParams() {
  return VN_SCENE_LIST.map((s) => ({ sceneId: s.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sceneId } = await params;
  const scene = getVNScene(sceneId);
  if (!scene) {
    return { title: '존재하지 않는 씬 | 키사라기고교' };
  }
  return { title: `${scene.title} | 키사라기고교` };
}

export default async function VnScenePage({ params }: Props) {
  const { sceneId } = await params;
  const scene = getVNScene(sceneId);
  if (!scene) {
    return <VnSceneMissing sceneId={sceneId} />;
  }
  return (
    <Suspense fallback={null}>
      <VnSceneClient scene={scene} scenes={VN_SCENES} />
    </Suspense>
  );
}
