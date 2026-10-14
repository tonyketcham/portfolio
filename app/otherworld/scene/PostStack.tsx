'use client';

/**
 * Takes over rendering (useFrame priority 1): the world renders into a
 * low-res pass (the chunky old-school pixels, and a big win on phones), then
 * one node graph applies pixel-art outlines and the visitor's ordered "Modyfi
 * stack", plus mushroom warp, unfold glitch, VHS rewind and location fades.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three/webgpu';
import { tweaks } from '../debug/tweaks';
import { lerp } from '../lib/random';
import { createPost, stackKey, writeStackUniforms } from '../shaders/post';
import { runtime } from '../state/runtime';
import { gameState } from '../state/store';

export const postState = { rewind: 0, flash: 0, fade: 0, sceneHeight: 600 };

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function PostStack() {
  const { gl, scene, camera, size } = useThree();
  const renderer = gl as unknown as THREE.WebGPURenderer;
  const post = useMemo(() => createPost(renderer, scene, camera), [renderer, scene, camera]);
  const key = useRef<string | null>(null);

  useEffect(() => () => post.dispose(), [post]);

  useFrame((_, dt) => {
    const g = gameState();
    const t = tweaks();
    const stack = t['Modyfi stack'];
    const worldness = g.stage === 'world' ? 1 : g.stage === 'unfolding' ? easeInOut(runtime.intro.unfold) : 0;

    const k = stackKey(g.effects);
    if (k !== key.current) {
      key.current = k;
      post.build(g.effects);
    }

    const pixelScale = lerp(1, stack.pixelScale, worldness);
    const dpr = renderer.getPixelRatio();
    post.setPixelScale(pixelScale);
    post.updateSizes(size.width, size.height, dpr, pixelScale);
    postState.sceneHeight = Math.round(size.height * dpr * pixelScale);

    const P = post.uniforms;
    writeStackUniforms(P, g.effects, worldness, stack, g.palette);
    P.outline.value = stack.outline * lerp(0.4, 1, worldness);
    P.crease.value = stack.crease * worldness;
    P.outlineColor.value.set(stack.outlineColor);
    P.glitch.value = g.stage === 'unfolding' ? Math.sin(Math.PI * runtime.intro.unfold) ** 3 * stack.glitch : 0;
    postState.flash = Math.max(0, postState.flash - dt * 3);
    P.flash.value = postState.flash;
    P.rewind.value = postState.rewind;
    P.fade.value = postState.fade;
    const cam = camera as THREE.PerspectiveCamera;
    P.near.value = cam.near;
    P.far.value = cam.far;

    post.pipeline.render();
  }, 1);

  return null;
}
