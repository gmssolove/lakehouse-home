import { Suspense } from 'react';
import { OcPageClient } from '@/components/oc/OcPageClient';

export default function OcPage() {
  return (
    <Suspense fallback={null}>
      <OcPageClient />
    </Suspense>
  );
}
