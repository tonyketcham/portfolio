'use client';

/**
 * Mounts every DialKit panel declared in tweaks.ts and mirrors live values into
 * the tweak store. Only rendered when the debug panel is enabled
 * (dev builds, `?dial`, or typing `::dial` in chat).
 */
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import { useEffect } from 'react';
import { runDebugAction } from '../state/actions';
import { PANELS, useTweaks, type Tweaks } from './tweaks';

type PanelName = keyof typeof PANELS;

function usePanel<P extends PanelName>(name: P) {
  const values = useDialKit(name, PANELS[name] as never, {
    persist: true,
    onAction: (path: string) => runDebugAction(name, path),
  }) as unknown as Tweaks[P];
  useEffect(() => {
    useTweaks.setState({ [name]: values } as Partial<Tweaks>);
  }, [name, values]);
}

function Panels() {
  usePanel('World');
  usePanel('Modyfi stack');
  usePanel('Camera');
  usePanel('Player');
  usePanel('Physics');
  usePanel('HUD');
  usePanel('Intro');
  usePanel('Artboards');
  usePanel('Flora');
  usePanel('Debug');
  return null;
}

export default function DialBridge() {
  return (
    <>
      <Panels />
      <div className="ow-dialkit">
        <DialRoot position="top-left" defaultOpen productionEnabled />
      </div>
    </>
  );
}
