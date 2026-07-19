import { Suspense } from 'react';
import { OcPageClient } from '@/components/oc/OcPageClient';

export default function OcPage() {
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
          OC
        </div>
      }
    >
      <OcPageClient />
    </Suspense>
  );
}
