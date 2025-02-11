import { ChromaticAberrationFilter } from '@/app/filters/DistortionAnimationFilter';
import { DragDisplacementFilter } from '@/app/filters/DragDisplacementFilter';
import { FilmGrainFilter } from '@/app/filters/FilmGrainFilter';

/**
 * Defines effects that can be applied to elements using SVG filters. These definitions must be included in the DOM for references to work.
 */
export function FilterDefinitions() {
  return (
    <svg width="0" height="0" aria-hidden="true">
      <FilmGrainFilter />
      <ChromaticAberrationFilter />
      {/* <DragDisplacementFilter /> */}
    </svg>
  );
}
