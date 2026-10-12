'use client';

import type { CSSProperties } from 'react';
/**
 * Untitled-1: the portfolio as a design-tool canvas that thinks it's an
 * old-school MMO. Root composition: the r3f canvas, the HUD, and the DialKit
 * bridge (dev, `?dial`, or `::dial` in chat).
 */
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import { Suspense, useEffect, useState } from 'react';
import * as THREE from 'three';
import { installSfx } from './audio/sfx';
import { useTweaks } from './debug/tweaks';
import { Hud } from './hud/Hud';
import { Scene } from './scene/Scene';
import { useGame } from './state/store';

const DialBridge = dynamic(() => import('./debug/DialBridge'), { ssr: false });

function supportsWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
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
    setWebgl(supportsWebGL2());
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
    return () => {
      window.clearTimeout(t);
      uninstall();
    };
  }, []);

  if (webgl === false) {
    return (
      <div className="ow-root ow-nogl" data-skin="tool">
        <div className="ow-panel ow-nogl-card">
          <p className="ow-title">Untitled-1 couldn’t open</p>
          <p>This browser doesn’t support WebGL2, so the canvas can’t unfold here.</p>
          <a className="ow-btn" href="/classic">
            Open the classic portfolio →
          </a>
        </div>
      </div>
    );
  }

  return (
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
          gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false }}
          camera={{ fov: 38, near: 0.1, far: 700, position: [0, 30, 10] }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      )}
      <Hud />
      {dialOpen && <DialBridge />}
    </div>
  );
}
