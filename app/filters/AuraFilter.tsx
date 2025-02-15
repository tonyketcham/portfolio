export function AuraFilter() {
  return (
    <filter
      id="aura"
      x="-400%"
      y="-400%"
      width="800%"
      height="800%"
      colorInterpolationFilters="sRGB"
      primitiveUnits="objectBoundingBox"
    >
      <feGaussianBlur stdDeviation={0.2} result="in" />

      <feTurbulence
        type="fractalNoise"
        baseFrequency={3.5}
        numOctaves="2"
        stitchTiles="stitch"
        patternTransform="scale(1)"
      />

      <feDisplacementMap in="in" scale={0.3} yChannelSelector="B" />
      <feComponentTransfer>
        {/* Dial back the opacity with a more pronounced fall-off */}
        <feFuncA type="table" tableValues="0 0.1 0.51 1 1" />
      </feComponentTransfer>

      {/* Composite the original underlying element back on top so the effect is behind */}
      <feBlend in="SourceGraphic" />
    </filter>
  );
}
