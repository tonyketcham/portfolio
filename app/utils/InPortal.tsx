'use client';

import { useEffect, useState, type PropsWithChildren } from 'react';
import ReactDOM from 'react-dom';

export enum PortalId {
  Topout = 'topout',
}

export function InPortal({
  id = PortalId.Topout,
  children,
}: PropsWithChildren<{ id?: string }>) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // This ensures that the portal receiver exists before attempting to render children into it.
  if (!hasMounted) {
    return null;
  }

  const container = document.querySelector(`#${id}`);

  if (!container) {
    console.error('Target portal ID not found', { id });
    return null;
  }

  return ReactDOM.createPortal(children, container);
}

export function PortalReceiver({ id = PortalId.Topout }: { id?: string }) {
  return <div id={id} className="relative z-9999" />;
}
