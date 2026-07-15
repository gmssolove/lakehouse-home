import { Suspense } from 'react';
import { TrpgScenarioPageClient } from '@/components/trpg/TrpgScenarioPageClient';

type Props = {
  params: Promise<{ id: string }>;
};

/** Tauri 정적 export용 — 실제 목록은 클라이언트에서 로드 */
export function generateStaticParams() {
  return [{ id: '_' }];
}

export default async function TrpgScenarioPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <TrpgScenarioPageClient id={id} />
    </Suspense>
  );
}
