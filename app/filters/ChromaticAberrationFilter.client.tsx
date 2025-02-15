import React from 'react';

/**
 * Creates a chromatic aberration effect by splitting R/G/B channels
 * and displacing them separately using fractal noise.
 *
 * @param fps - Frames per second for the noise animation
 */
function ChromaticAberrationFilterClient({ fps = 24 }: { fps?: number }) {
  // Generate random seeds for each 'frame' (1 second of animation)
  const seedCount = fps;
  const seeds = Array.from({ length: seedCount }, () =>
    Math.floor(Math.random() * 1000)
  );
  const seedValues = seeds.join(';');

  const durationSeconds = '4s'; // 1-second loop

  return (
    <filter id="chromaticAberrationFilter">
      {/* 1) Generate animated fractal noise */}
      <feTurbulence
        type="fractalNoise"
        baseFrequency=" 0.01 0.025"
        numOctaves={1}
        result="noise"
      >
        <animate
          attributeName="seed"
          values={seedValues}
          dur={durationSeconds}
          repeatCount="indefinite"
          calcMode="discrete"
        />
      </feTurbulence>

      {/* 2) Isolate the red channel */}
      <feColorMatrix
        in="SourceGraphic"
        type="matrix"
        values="
          1 0 0 0 0
          0 0 0 0 0
          0 0 0 0 0
          0 0 0 1 0
        "
        result="redChannel"
      />
      {/* Displace red channel */}
      <feDisplacementMap
        in="redChannel"
        in2="noise"
        xChannelSelector="R"
        yChannelSelector="R"
        scale="8"
        result="redDisplaced"
      />

      {/* 3) Isolate the green channel */}
      <feColorMatrix
        in="SourceGraphic"
        type="matrix"
        values="
          0 0 0 0 0
          0 1 0 0 0
          0 0 0 0 0
          0 0 0 1 0
        "
        result="greenChannel"
      />
      {/* Displace green channel (could use a slightly different scale) */}
      <feDisplacementMap
        in="greenChannel"
        in2="noise"
        xChannelSelector="R"
        yChannelSelector="G"
        scale="6"
        result="greenDisplaced"
      />

      {/* 4) Isolate the blue channel */}
      <feColorMatrix
        in="SourceGraphic"
        type="matrix"
        values="
          0 0 0 0 0
          0 0 0 0 0
          0 0 1 0 0
          0 0 0 1 0
        "
        result="blueChannel"
      />
      {/* Displace blue channel (could use yet another scale) */}
      <feDisplacementMap
        in="blueChannel"
        in2="noise"
        xChannelSelector="R"
        yChannelSelector="G"
        scale="10"
        result="blueDisplaced"
      />

      {/* 5) Recombine the displaced channels */}
      {/* Blend R + G */}
      <feBlend
        in="redDisplaced"
        in2="greenDisplaced"
        mode="screen"
        result="rg"
      />
      {/* Blend (R+G) with B */}
      <feBlend in="rg" in2="blueDisplaced" mode="screen" result="finalOutput" />

      {/* The final output of the filter */}
    </filter>
  );
}

export default ChromaticAberrationFilterClient;
