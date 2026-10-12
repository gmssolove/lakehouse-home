'use client';

import { useLayoutEffect, useState } from 'react';

/** Next useSearchParams 는 페이지를 빈 Suspense로 비움 */
export function useWindowSearchParams() {
  const [search, setSearch] = useState('');
  useLayoutEffect(() => {
    const sync = () => setSearch(window.location.search);
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}
