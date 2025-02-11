'use client';

import React, { useRef, useState, useEffect } from 'react';

/**
 * Demonstrates a displacement effect that occurs only where
 * the user drags the mouse (“painting” displacement).
 */
export function DragDisplacementFilter() {
  const [displacementDataUrl, setDisplacementDataUrl] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // 1) Compute full page size
    const docWidth = document.documentElement.scrollWidth;
    const docHeight = document.documentElement.scrollHeight;

    console.log('Document size:', docWidth, docHeight);

    // 2) Create an offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = docWidth;
    canvas.height = docHeight;

    // Fill with black (no displacement)
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, docWidth, docHeight);
    }

    canvasRef.current = canvas;
    // Convert to data URL (initially all black)
    setDisplacementDataUrl(canvas.toDataURL('image/png'));
  }, []);

  // 3) Listen for pointer moves across the entire document.
  //    We only draw if the pointer is down (buttons === 1).
  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // e.pageX / e.pageY are absolute coords from the top-left of the page.
      const x = e.pageX;
      const y = e.pageY;

      // Paint a white circle where the user moves.
      // White => strong displacement in the filter.
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(x, y, 80, 0, 2 * Math.PI);
      ctx.fill();

      const newDataUrl = canvas.toDataURL('image/png');
      console.log('Updated displacement map', newDataUrl);
      setDisplacementDataUrl(newDataUrl);
    }

    document.addEventListener('pointermove', handlePointerMove);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  return (
    <filter
      id="dragDisplacementFilter"
      // Use userSpaceOnUse or objectBoundingBox carefully;
      // For simplicity, set an absolute size if you know your page dims.
      filterUnits="userSpaceOnUse"
      x="0"
      y="0"
      width="100%"
      height="100%"
    >
      {/* The user's drawn displacement map */}
      <feImage
        xlinkHref={displacementDataUrl}
        result="displacementMap"
        x="0"
        y="0"
        width="2000px"
        height="800px"
        preserveAspectRatio="none"
      />
      {/* Displace the entire page. White = strong displacement, black = none */}
      <feDisplacementMap
        in="SourceGraphic"
        in2="displacementMap"
        scale="300"
        yChannelSelector="G"
      />
    </filter>
  );
}
