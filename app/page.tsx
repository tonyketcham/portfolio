'use client';

import { useCallback, useRef, useState } from 'react';
import Header from './components/Header';
import Overview from './components/Overview';
import { Editor } from '@/app/editor/Editor';

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
      <div className="mx-auto max-w-(--breakpoint-2xl) px-6 pt-20 lg:pt-14 space-y-24 lg:space-y-0">
        <Header handleMushroomClick={handleMushroomClick} />
        <Overview />
        <main>
          <Editor />
        </main>
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
