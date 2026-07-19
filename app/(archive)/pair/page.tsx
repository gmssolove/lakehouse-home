import { Suspense } from 'react';
import { PairPageClient } from '@/components/pair/PairPageClient';

export default function PairPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: '#0b0d0c',
            color: 'rgba(240,207,173,0.55)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 13,
            letterSpacing: '0.12em',
          }}
        >
          Pair
        </div>
      }
    >
      <PairPageClient />
    </Suspense>
  );
}
