'use client';

/**
 * Mounts every DialKit (v2) panel declared in tweaks.ts and mirrors live values
 * into the tweak store. Only rendered when the debug panel is enabled
 * (dev builds, `?dial`, or typing `::dial` in chat).
 *
 * Targeting: Alt-click anything in the world (or `::target <panel>`) and the
 * panel that controls it opens while the rest collapse.
 */
import { DialRoot, useDialKitController } from 'dialkit';
import 'dialkit/styles.css';
import { useEffect, useRef } from 'react';
import { runDebugAction } from '../state/actions';
import { on } from '../state/events';
import { gameState } from '../state/store';
import { PANELS, useTweaks, type Tweaks } from './tweaks';

type PanelName = keyof typeof PANELS;

const openers = new Map<PanelName, (open: boolean) => void>();

function usePanel<P extends PanelName>(name: P, collapsed = true) {
  const controller = useDialKitController(name, PANELS[name] as never, {
    persist: true,
    defaultCollapsed: collapsed,
    onAction: (path: string) => runDebugAction(name, path),
  });
  const values = controller.values as unknown as Tweaks[P];
  const setOpen = useRef(controller.setOpen);
  setOpen.current = controller.setOpen;
  useEffect(() => {
    openers.set(name, (open) => setOpen.current(open));
    return () => {
      openers.delete(name);
    };
  }, [name]);
  useEffect(() => {
    useTweaks.setState({ [name]: values } as Partial<Tweaks>);
  }, [name, values]);
}

function Panels() {
  usePanel('Modyfi stack', false);
  usePanel('World');
  usePanel('Camera');
  usePanel('Player');
  usePanel('Physics');
  usePanel('Artboards');
  usePanel('Flora');
  usePanel('HUD');
  usePanel('Intro');
  usePanel('Debug');

  useEffect(
    () =>
      on((e) => {
        if (e.type !== 'dial-target') return;
        const target = (Object.keys(PANELS) as PanelName[]).find(
          (p) => p.toLowerCase() === e.panel.toLowerCase() || p.toLowerCase().startsWith(e.panel.toLowerCase())
        );
        if (!target) {
          gameState().say(`No DialKit panel called "${e.panel}". Try: ${Object.keys(PANELS).join(', ')}`, 'system');
          return;
        }
        for (const [name, setOpen] of openers) setOpen(name === target);
        gameState().say(`DialKit → ${target}`, 'system');
      }),
    []
  );
  return null;
}

export default function DialBridge() {
  return (
    <>
      <Panels />
      <div className="ow-dialkit">
        <DialRoot position="top-left" defaultOpen theme="dark" productionEnabled />
      </div>
    </>
  );
}
