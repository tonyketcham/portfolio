'use client';

import { cn } from '@/app/utils/css';
import { useAreFilterDefinitionsSupported } from '@/app/filters/SupportedFilterDefinitionsProvider';
import BackgroundVideo from 'next-video/background-video';
import type { Asset } from 'next-video/dist/assets.js';

interface VideoProps {
  src: Asset;
  loop?: boolean;
  muted?: boolean;
  eager?: boolean;
  autoPlay?: boolean;
  /** Controls the pixelation level of the poster. Higher numbers = larger pixels. Default: 10 */
  pixelationLevel?: number;
  wrapperClassName?: string;
  className?: string;
}

export function Video({
  src,
  loop = true,
  muted = true,
  wrapperClassName,
  className,
}: VideoProps) {
  const areFiltersSupported = useAreFilterDefinitionsSupported();

  return (
    <div
      className={cn('relative', wrapperClassName)}
      style={{
        filter: `contrast(1.1) ${areFiltersSupported ? 'url(#aura)' : ''}`,
        backdropFilter: `${areFiltersSupported ? 'url(#aura)' : 'none'}`,
      }}
    >
      <BackgroundVideo
        src={src}
        className={className}
        muted={muted}
        loop={loop}
      />
    </div>
  );
}
