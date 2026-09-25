'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ResolvedSite } from '@/lib/site/context';

const SiteContext = createContext<ResolvedSite | null>(null);

export function SiteProvider({
  site,
  children,
}: {
  site: ResolvedSite | null;
  children: ReactNode;
}) {
  return <SiteContext.Provider value={site}>{children}</SiteContext.Provider>;
}

export function useSite(): ResolvedSite | null {
  return useContext(SiteContext);
}
