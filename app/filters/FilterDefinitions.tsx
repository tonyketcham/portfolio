import { AuraFilter } from '@/app/filters/AuraFilter';
import { ChromaticAberrationFilter } from '@/app/filters/DistortionAnimationFilter';

/**
 * Defines effects that can be applied to elements using SVG filters. These definitions must be included in the DOM for references to work.
 */
export function FilterDefinitions() {
  return (
    <svg width="0" height="0" aria-hidden="true">
      <ChromaticAberrationFilter />
      <AuraFilter />
    </svg>
  );
}
