'use client';

import { useCallback, useRef, useState } from 'react';
import Header from './components/Header';
import Overview from './components/Overview';
import { Editor } from '@/app/editor/Editor';
import { PortalReceiver } from '@/app/utils/InPortal';
import { Footer } from '@/app/components/Footer';
import WhiteNoise from '@/public/white_noise_w_transparency.webp';

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
      className="relative min-h-screen font-[family-name:var(--font-chivo-mono)] overflow-hidden"
      style={{
        filter: pageFilter,
      }}
    >
      <div className="mx-auto max-w-(--breakpoint-2xl) px-6 pt-20 lg:pt-14 space-y-24 lg:space-y-0 bg-zinc-950 border-b border-zinc-200 outline outline-zinc-800/20 shadow-2xl shadow-zinc-950/40 rounded-b-2xl mb-80">
        <Header handleMushroomClick={handleMushroomClick} />
        <Overview />
        <main>
          <Editor />
        </main>
        <div
          style={{
            backgroundImage: `url(${WhiteNoise.src})`,
            backgroundSize: '800px 800px',
          }}
          className="absolute inset-0 w-full bg-repeat object-scale-down pointer-events-none opacity-5"
        />
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
        <PortalReceiver />
      </div>
      <Footer className="fixed bottom-0 -z-10" />
    </div>
  );
}
