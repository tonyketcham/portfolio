'use client';

/**
 * Renders the world into a low-res target (the chunky old-school pixels, and a
 * big win on phones), then runs a single full-screen pass that applies the
 * visitor's "Modyfi stack" in order, plus mushroom warp, unfold glitch and
 * the VHS rewind.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { tweaks } from '../debug/tweaks';
import { lerp } from '../lib/random';
import { createPostPass, createSceneTarget, writeStackUniforms } from '../shaders/post';
import { runtime } from '../state/runtime';
import { gameState } from '../state/store';

export const postState = { rewind: 0, flash: 0, sceneHeight: 600 };

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function PostStack() {
  const { gl, scene, camera, size } = useThree();

  const target = useMemo(createSceneTarget, []);
  const post = useMemo(() => createPostPass(target.texture), [target]);

  useEffect(() => {
    gl.setClearColor('#09090b', 1);
    return () => target.dispose();
  }, [gl, target]);

  useFrame((_, dt) => {
    const g = gameState();
    const t = tweaks();
    const stack = t['Modyfi stack'];
    const worldness =
      g.stage === 'world' ? 1 : g.stage === 'unfolding' ? easeInOut(runtime.intro.unfold) : 0;

    const pixelScale = lerp(1, stack.pixelScale, worldness);
    const dpr = gl.getPixelRatio();
    const w = Math.max(2, Math.round(size.width * dpr * pixelScale));
    const h = Math.max(2, Math.round(size.height * dpr * pixelScale));
    if (target.width !== w || target.height !== h) target.setSize(w, h);
    postState.sceneHeight = h;

    const u = post.material.uniforms;
    u.uRes.value.set(size.width * dpr, size.height * dpr);
    u.uSceneRes.value.set(w, h);
    u.uDpr.value = dpr;

    writeStackUniforms(post.material, g.effects, worldness, stack, g.palette);
    u.uGlitch.value =
      g.stage === 'unfolding' ? Math.sin(Math.PI * runtime.intro.unfold) ** 3 * stack.glitch : 0;
    postState.flash = Math.max(0, postState.flash - dt * 3);
    u.uFlash.value = postState.flash;
    u.uRewind.value = postState.rewind;

    gl.setRenderTarget(target);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.render(post.scene, post.camera);
  }, 1);

  return null;
}
