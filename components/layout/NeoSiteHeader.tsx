'use client';

import { useSiteContent } from '@/lib/hooks/useSiteContent';

export function NeoSiteHeader() {
  const { main } = useSiteContent();
  const heading = `${main.heading || 'lake'}${main.headingAccent || 'house'}`;

  return (
    <header className="neo-header">
      <div className="neo-header__banner" aria-hidden="true" />
      <h1 className="neo-header__title">{heading}</h1>
      {main.latin ? <p className="neo-header__latin">{main.latin}</p> : null}
    </header>
  );
}
