'use client';

/**
 * Mux HLS → THREE.VideoTexture, only while a piece is being inspected.
 * Safari plays HLS natively; everyone else gets hls.js (lazy-loaded).
 */
import { useEffect, useState } from 'react';
import * as THREE from 'three';

export function useMuxVideoTexture(playbackId: string | null) {
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);

  useEffect(() => {
    if (!playbackId) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    let tex: THREE.VideoTexture | null = null;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    const src = `https://stream.mux.com/${playbackId}.m3u8`;

    const ready = () => {
      if (cancelled || tex) return;
      tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.userData.naturalWidth = video.videoWidth;
      tex.userData.naturalHeight = video.videoHeight;
      setTexture(tex);
    };
    video.addEventListener('playing', ready);

    (async () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
      } else {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (!Hls.isSupported()) return;
        const instance = new Hls({ capLevelToPlayerSize: false, maxBufferLength: 10 });
        instance.loadSource(src);
        instance.attachMedia(video);
        hls = instance;
      }
      video.play().catch(() => {
        /* autoplay refused: the poster stays up */
      });
    })().catch((error) => console.warn('[otherworld] video failed', error));

    return () => {
      cancelled = true;
      video.removeEventListener('playing', ready);
      video.pause();
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
      tex?.dispose();
      setTexture(null);
    };
  }, [playbackId]);

  return texture;
}
