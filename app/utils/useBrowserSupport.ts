'use client';

import isSafari from '@braintree/browser-detection/dist/is-safari';
import isIOS from '@braintree/browser-detection/dist/is-ios';
import { useEffect, useState } from 'react';

export const useIsSvgFilterSupported = () => {
  // Optimistically default to true during SSR.
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    // Now that we're on the client, update the state.
    if (
      isSafari() ||
      isIOS() // Safari and iOS have known issues with SVG filters which are non-trivial to check against feature-level support
    ) {
      setIsSupported(false);
    }
  }, []);

  return isSupported;
};
