import React from 'react';

/**
 * @param fps - Frames per second for the grain animation
 */
export function FilmGrainFilter({ fps = 6 }: { fps?: number }) {
  // Generate random seeds for each 'frame'
  const seedCount = fps; // 1 second of animation, with 'fps' frames
  const seeds = Array.from({ length: seedCount }, () =>
    Math.floor(Math.random() * 1000)
  );
  const seedValues = seeds.join(';');

  // The duration for 1 loop. Repeat indefinitely.
  const durationSeconds = '1s';

  return (
    <filter id="filmGrainFilter">
      {/* Generate fractal noise for the grain */}
      <feGaussianBlur stdDeviation={0} result="blurred" />
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.5"
        numOctaves="2"
        result="grain"
      >
        {/* Animate 'seed' in discrete steps at the specified FPS */}
        <animate
          attributeName="seed"
          values={seedValues}
          dur={durationSeconds}
          repeatCount="indefinite"
          calcMode="discrete"
        />
      </feTurbulence>

      <feDisplacementMap
        in="blurred"
        in2="fractalNoise"
        scale="10"
        yChannelSelector="R"
        xChannelSelector="G"
      />

      {/* Optional color matrix. You can tweak it to adjust contrast, brightness, etc. */}
      <feColorMatrix
        in="grain"
        type="matrix"
        values="
              0.5 0 0 0 0
              0 0.5 0 0 0
              0 0 0.5 0 0
              0 0 0 0.5 0
            "
        result="grain"
      />

      {/* Blend the grain on top of the original graphic */}
      <feBlend in="blurred" in2="grain" mode="multiply" />
    </filter>
  );
}
