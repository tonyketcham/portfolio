/**
 * Renderer bootstrapping: WebGPU when the browser has it, three's WebGL2
 * backend when it doesn't, and the classic page when neither works.
 */
import * as THREE from 'three/webgpu';

/**
 * three r185+ always passes `swizzle: 'rgba'` in texture view descriptors.
 * Some Chromium builds shipped an older IDL for that member and throw on the
 * string. 'rgba' is the identity swizzle, so dropping it changes nothing.
 */
let shimmed = false;
export function installWebGpuShims() {
  if (shimmed || typeof GPUTexture === 'undefined') return;
  shimmed = true;
  const createView = GPUTexture.prototype.createView;
  GPUTexture.prototype.createView = function (descriptor?: GPUTextureViewDescriptor) {
    const d = descriptor as (GPUTextureViewDescriptor & { swizzle?: string }) | undefined;
    if (d && d.swizzle === 'rgba') {
      const { swizzle: _identity, ...rest } = d;
      return createView.call(this, rest);
    }
    return createView.call(this, descriptor);
  };
}

export function supportsWebGL2() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export const hasWebGPU = () => typeof navigator !== 'undefined' && 'gpu' in navigator;

/** `?webgl` forces the WebGL2 backend (for comparing, or for flaky drivers). */
export function forceWebGL() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('webgl');
}

export async function createRenderer(canvas: HTMLCanvasElement | OffscreenCanvas) {
  installWebGpuShims();
  const renderer = new THREE.WebGPURenderer({
    canvas: canvas as HTMLCanvasElement,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    forceWebGL: forceWebGL() || !hasWebGPU(),
  });
  await renderer.init();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  return renderer;
}

export const backendName = (renderer: THREE.WebGPURenderer) =>
  (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';
