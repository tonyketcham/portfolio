'use client';

import { TonyLogo } from '@/app/TonyLogo';
import { TransformBounds } from '@/app/TransformBounds';
import { Video } from '@/app/media/Video';
import Amanita from '@/public/Amanita.webp';
import { motion } from 'motion/react';
import { useCallback, useRef, useState } from 'react';

export default function Home() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageFilter, setPageFilter] = useState('none');

  const handleMushroomClick = useCallback(() => {
    if (pageFilter === 'none') {
      setPageFilter('url(#chromaticAberrationFilter)');
    } else {
      setPageFilter('none');
    }
  }, [pageFilter]);

  return (
    <div
      ref={pageRef}
      className="relative min-h-screen font-[family-name:var(--font-geist-sans)] overflow-hidden"
      style={{
        filter: pageFilter,
      }}
    >
      <div className="mx-auto max-w-screen-2xl px-6 pt-14">
        <motion.header className="relative flex flex-row justify-end">
          <div className="absolute left-56 inset-y-0 my-auto h-fit">
            <TransformBounds
              className="relative h-fit"
              renderDimensionFeedbackOnHover={
                <>
                  he <span className="opacity-70">/</span> they
                </>
              }
            >
              <Video
                src="/Amanita.mp4"
                wrapperClassName="max-w-[425px] rounded-[158px] overflow-hidden"
                className="object-cover aspect-square"
                poster={{
                  src: '/Amanita.webp',
                  data: Amanita,
                }}
                eager
              />
              <button
                type="button"
                onClick={handleMushroomClick}
                className="absolute right-[14%] bottom-[18%] pointer-events-auto w-2/6 h-1/4 rounded-full z-[51]"
                aria-label="Mushroom mode"
              />
            </TransformBounds>
          </div>

          <TonyLogo className="inline-block w-[85%] text-white" />
        </motion.header>
        {/* <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
          <p>Hi</p>
        </main>
        <footer className="flex gap-6 flex-wrap items-center justify-center">
          <a
            className="flex items-center gap-2 hover:underline hover:underline-offset-4"
            href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn
          </a>
          <a
            className="flex items-center gap-2 hover:underline hover:underline-offset-4"
            href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              aria-hidden
              src="/window.svg"
              alt="Window icon"
              width={16}
              height={16}
            />
            Examples
          </a>
          <a
            className="flex items-center gap-2 hover:underline hover:underline-offset-4"
            href="https://nextjs.org?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              aria-hidden
              src="/globe.svg"
              alt="Globe icon"
              width={16}
              height={16}
            />
            Go to nextjs.org →
          </a>
        </footer> */}
      </div>
    </div>
  );
}
