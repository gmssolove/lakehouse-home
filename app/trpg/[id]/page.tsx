import { Suspense } from 'react';
import { TrpgScenarioPageClient } from '@/components/trpg/TrpgScenarioPageClient';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function TrpgScenarioPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <TrpgScenarioPageClient id={id} />
    </Suspense>
  );
}
