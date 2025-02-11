'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useIntersectionObserver } from 'usehooks-ts';
import Image from 'next/image';
import { cn } from '@/app/utils/css';
import type { StaticImport } from 'next/dist/shared/lib/get-img-props';

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
  autoPlay = true,
  wrapperClassName,
  className,
}: VideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [showPoster, setShowPoster] = useState(false);

  // Detect when video is in viewport
  const { isIntersecting, ref: intersectionRef } = useIntersectionObserver({
    threshold: 0,
    initialIsIntersecting: eager,
  });

  // Handle muted attribute for video element
  // Related issue: https://github.com/facebook/react/issues/10389
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.defaultMuted = muted;
    }
  }, [muted]);

  // Handle video autoplay when in viewport
  useEffect(() => {
    if (!autoPlay || !videoRef.current || !isVideoLoaded) return;

    let isCancelled = false;
    let playPromise: Promise<void> | null = null;

    const handleVideoPlayback = async () => {
      const video = videoRef.current;
      if (!video || isCancelled) return;

      try {
        if (isIntersecting && video.paused) {
          playPromise = video.play();
          await playPromise;
        } else if (!isIntersecting && !video.paused) {
          if (playPromise) await playPromise;
          video.pause();
        }
      } catch (error) {
        if (!isCancelled) {
          console.error(
            `Error ${video.paused ? 'playing' : 'pausing'} video:`,
            src,
            error
          );
        }
      }
    };

    void handleVideoPlayback();

    return () => {
      isCancelled = true;
    };
  }, [isIntersecting, autoPlay, src, isVideoLoaded]);

  // Delay showing the poster
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    if (!isVideoLoaded) {
      setShowPoster(true);
    } else {
      timeoutId = setTimeout(() => {
        setShowPoster(false);
      }, 10);
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isVideoLoaded]);

  return (
    <div
      ref={intersectionRef}
      className={cn('relative', wrapperClassName)}
      style={{
        aspectRatio: width && height ? `${width}/${height}` : undefined,
        filter: `contrast(1.1) url(#aura)`,
      }}
    >
      <video
        ref={videoRef}
        style={{ visibility: isVideoLoaded ? 'visible' : 'hidden' }}
        onCanPlay={() => setIsVideoLoaded(true)}
        src={src}
        poster={poster.src}
        width={width}
        height={height}
        className={className}
        playsInline
        preload="auto"
        muted={muted}
        autoPlay={eager}
        loop={loop}
      />
      <AnimatePresence>
        {poster && showPoster && (
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
              className={cn('w-full', className)}
              style={{ imageRendering: 'pixelated' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
