'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type Value = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
};

const MainBgmVisibilityContext = createContext<Value>({
  hidden: false,
  setHidden: () => {},
});

export function MainBgmVisibilityProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const value = useMemo(() => ({ hidden, setHidden }), [hidden]);
  return <MainBgmVisibilityContext.Provider value={value}>{children}</MainBgmVisibilityContext.Provider>;
}

export function useMainBgmVisibility() {
  return useContext(MainBgmVisibilityContext);
}
