'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useIntersectionObserver } from 'usehooks-ts';
import Image from 'next/image';
import { cn } from '@/app/utils/css';
import type { StaticImport } from 'next/dist/shared/lib/get-img-props';
import { useAreFilterDefinitionsSupported } from '@/app/filters/SupportedFilterDefinitionsProvider';

interface VideoProps {
  src: string;
  width?: number;
  height?: number;
  poster: {
    src: string;
    data: StaticImport;
  };
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
  width,
  height,
  poster,
  loop = true,
  muted = true,
  eager = false,
  wrapperClassName,
  className,
}: VideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const areFiltersSupported = useAreFilterDefinitionsSupported();

  // Detect when video is in viewport
  const { ref: intersectionRef } = useIntersectionObserver({
    threshold: 0,
    initialIsIntersecting: eager,
    onChange(isIntersecting) {
      const video = videoRef.current;

      if (video && isIntersecting) {
        video.play();
      } else if (video && !isIntersecting) {
        video.pause();
      }
    },
  });

  // Handle muted attribute for video element
  // Related issue: https://github.com/facebook/react/issues/10389
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.defaultMuted = muted;
    }
  }, [muted]);

  return (
    <div
      ref={intersectionRef}
      className={cn('relative', wrapperClassName)}
      style={{
        aspectRatio: width && height ? `${width}/${height}` : undefined,
        filter: `contrast(1.1) ${areFiltersSupported ? 'url(#aura)' : ''}`,
        backdropFilter: `${areFiltersSupported ? 'url(#aura)' : 'none'}`,
      }}
    >
      <video
        ref={videoRef}
        onPlaying={() => setIsVideoLoaded(true)}
        src={src}
        width={width}
        height={height}
        className={className}
        playsInline
        preload="auto"
        muted={muted}
        loop={loop}
      />
      <AnimatePresence>
        {poster && !isVideoLoaded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="absolute inset-0"
          >
            <Image
              aria-hidden
              alt=""
              src={poster.data}
              priority={eager}
              width={10}
              height={10}
              className={cn('w-full pointer-events-none', className)}
              style={{ imageRendering: 'pixelated' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
