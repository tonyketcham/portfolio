'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { makeLabel, type LabelOptions } from '../lib/textures';

interface LabelProps {
  text: string;
  /** World-space height of the text line. */
  height?: number;
  anchor?: 'left' | 'center' | 'right';
  options?: LabelOptions;
  position?: [number, number, number];
  rotation?: [number, number, number];
  opacity?: number;
  depthTest?: boolean;
  renderOrder?: number;
}

/** A single line of canvas-rendered text on a plane, frame-label style. */
export function Label({
  text,
  height = 0.16,
  anchor = 'left',
  options,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  opacity = 1,
  depthTest = true,
  renderOrder,
}: LabelProps) {
  const optionsKey = JSON.stringify(options ?? {});
  const { texture, aspect } = useMemo(
    () => makeLabel(text, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, optionsKey]
  );
  useEffect(() => () => texture.dispose(), [texture]);
  const width = height * aspect;
  const offset = anchor === 'left' ? width / 2 : anchor === 'right' ? -width / 2 : 0;
  return (
    <group position={position} rotation={rotation}>
      <mesh position-x={offset} renderOrder={renderOrder}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={opacity}
          depthWrite={false}
          depthTest={depthTest}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
