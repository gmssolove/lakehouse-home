import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="layout layout--home" style={{ minHeight: '100vh', background: '#0b0d0c' }} aria-hidden="true" />
      }
    >
      <HomePageClient />
    </Suspense>
  );
}
