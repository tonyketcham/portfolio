export function AuraFilter() {
  return (
    <filter
      id="aura"
      x="-200%"
      y="-200%"
      width="400%"
      height="400%"
      colorInterpolationFilters="sRGB"
      primitiveUnits="objectBoundingBox"
    >
      <feGaussianBlur stdDeviation={0.2} result="in" />

      <feTurbulence
        type="fractalNoise"
        baseFrequency={1.34}
        numOctaves="1"
        stitchTiles="stitch"
        patternTransform="scale(1)"
      />

      <feDisplacementMap in="in" scale={0.3} yChannelSelector="B" />
      <feComponentTransfer>
        {/* Dial back the opacity with a more pronounced fall-off */}
        <feFuncA type="table" tableValues="0 0.1 0.3 0.5 0.7 1" />
      </feComponentTransfer>

      {/* Composite the original underlying element back on top so the effect is behind */}
      <feBlend in="SourceGraphic" />
    </filter>
  );
}
