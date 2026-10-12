'use client';

import type { CSSProperties } from 'react';
/**
 * Untitled-1: the portfolio as a design-tool canvas that thinks it's an
 * old-school MMO. Root composition: the r3f canvas, the HUD, and the DialKit
 * bridge (dev, `?dial`, or `::dial` in chat).
 */
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { installMusic } from './audio/music';
import { installSfx } from './audio/sfx';
import { backendName, createRenderer, hasWebGPU, supportsWebGL2 } from './lib/gpu';
import { useTweaks } from './debug/tweaks';
import { Hud } from './hud/Hud';
import { Scene } from './scene/Scene';
import { runtime } from './state/runtime';
import { useGame } from './state/store';

const DialBridge = dynamic(() => import('./debug/DialBridge'), { ssr: false });

function NoCanvas({ reason }: { reason: string }) {
  return (
    <div className="ow-root ow-nogl" data-skin="tool">
      <div className="ow-panel ow-nogl-card">
        <p className="ow-title">Untitled-1 couldn’t open</p>
        <p>{reason}</p>
        <a className="ow-btn" href="/classic">
          Open the classic portfolio →
        </a>
      </div>
    </div>
  );
}

/** If the canvas or the HUD throws, fall back to the classic page instead of a blank screen. */
class RootBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[otherworld] crashed', error);
  }
  render() {
    return this.state.failed ? <NoCanvas reason="Something in the world broke. The classic portfolio still works." /> : this.props.children;
  }
}

export default function Otherworld() {
  const [fontsReady, setFontsReady] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const dialOpen = useGame((s) => s.dialOpen);
  const skin = useTweaks((t) => t.HUD.skin);
  const scale = useTweaks((t) => t.HUD.scale);
  const accent = useTweaks((t) => t.HUD.accent);
  const stage = useGame((s) => s.stage);

  useEffect(() => {
    setWebgl(hasWebGPU() || supportsWebGL2());
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setFontsReady(true);
      }
    };
    document.fonts?.ready.then(finish);
    const t = window.setTimeout(finish, 1500);
    const params = new URLSearchParams(window.location.search);
    if (process.env.NODE_ENV === 'development' || params.has('dial')) useGame.getState().setDialOpen(true);
    const uninstall = installSfx();
    const uninstallMusic = installMusic();
    return () => {
      window.clearTimeout(t);
      uninstall();
      uninstallMusic();
    };
  }, []);

  if (webgl === false) return <NoCanvas reason="This browser supports neither WebGPU nor WebGL2, so the canvas can’t unfold here." />;

  return (
    <RootBoundary>
    <div
      className="ow-root"
      data-skin={stage === 'world' ? skin : 'tool'}
      data-stage={stage}
      style={{ '--ow-scale': scale, '--ow-accent': accent } as CSSProperties}
    >
      {fontsReady && webgl && (
        <Canvas
          className="ow-canvas"
          dpr={[1, 1.75]}
          flat
          shadows="percentage"
          gl={async ({ canvas }) => {
            const renderer = await createRenderer(canvas);
            runtime.backend = backendName(renderer);
            return renderer as never;
          }}
          camera={{ fov: 38, near: 0.1, far: 700, position: [0, 30, 10] }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      )}
      <Hud />
      {dialOpen && <DialBridge />}
    </div>
    </RootBoundary>
  );
}
