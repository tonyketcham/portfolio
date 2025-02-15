'use client';

import { FilterDefinitions } from '@/app/filters/FilterDefinitions';
import { useIsSvgFilterSupported } from '@/app/utils/useBrowserSupport';
import { createContext, useContext, type PropsWithChildren } from 'react';

// Create context for if SVG filters are supported
export const SupportedFilterDefinitionsContext = createContext<boolean | null>(
  null
);

export function SupportedFilterDefinitionsProvider({
  children,
}: PropsWithChildren<unknown>) {
  const isSupported = useIsSvgFilterSupported();

  return (
    <>
      <SupportedFilterDefinitionsContext.Provider value={isSupported}>
        {children}
      </SupportedFilterDefinitionsContext.Provider>
      {isSupported && <FilterDefinitions />}
    </>
  );
}

export const useAreFilterDefinitionsSupported = () => {
  const isSupported = useContext(SupportedFilterDefinitionsContext);

  if (isSupported === null) {
    throw new Error(
      'useSupportedFilterDefinitions must be used within a SupportedFilterDefinitionsProvider'
    );
  }

  return isSupported;
};
