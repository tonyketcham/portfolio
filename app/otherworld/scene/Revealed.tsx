'use client';

/**
 * Renders children only once the intro's reveal wave has finished.
 * Physics colliders live inside groups that scale up from ~0 during the
 * unfold; react-three-rapier bakes world scale into a collider when it's
 * created, so colliders must be born at full size.
 */
import { useFrame } from '@react-three/fiber';
import { useState, type ReactNode } from 'react';
import { globalUniforms } from './globals';

export function Revealed({ children }: { children: ReactNode }) {
  const [done, setDone] = useState(() => globalUniforms.uReveal.value >= 80);
  useFrame(() => {
    const now = globalUniforms.uReveal.value >= 80;
    if (now !== done) setDone(now);
  });
  return done ? <>{children}</> : null;
}
