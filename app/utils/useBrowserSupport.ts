'use client';

import isSafari from '@braintree/browser-detection/dist/is-safari';
import { useEffect, useState } from 'react';

export const useIsSvgFilterSupported = () => {
  // Optimistically default to true during SSR.
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    // Now that we're on the client, update the state.
    setIsSupported(!isSafari());
  }, []);

  return isSupported;
};
