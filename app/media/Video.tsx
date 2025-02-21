'use client';

import { useAreFilterDefinitionsSupported } from '@/app/filters/SupportedFilterDefinitionsProvider';
import BackgroundVideo from 'next-video/background-video';
import type { Asset } from 'next-video/dist/assets.js';

interface VideoProps {
  src: Asset;
  aspectRatio: number;
  loop?: boolean;
  muted?: boolean;
  eager?: boolean;
  autoPlay?: boolean;
  wrapperClassName?: string;
  className?: string;
}

export function Video({
  src,
  aspectRatio,
  loop = true,
  muted = true,
  className,
}: VideoProps) {
  const areFiltersSupported = useAreFilterDefinitionsSupported();

  return (
    <BackgroundVideo
      src={src}
      className={className}
      muted={muted}
      loop={loop}
      style={{
        aspectRatio: aspectRatio,
        filter: `contrast(1.1) ${areFiltersSupported ? 'url(#aura)' : ''}`,
        backdropFilter: `${areFiltersSupported ? 'url(#aura)' : 'none'}`,
      }}
    />
  );
}
