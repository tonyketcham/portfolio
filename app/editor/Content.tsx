import { interactiveCardTypeAttr } from '@/app/editor/InteractiveCard';
import React from 'react';
import ResetPresents from '../../public/work/Reset Presents - Events Page-min.png';
import Image from 'next/image';
import Link from 'next/link';
import { Video } from '@/app/media/Video';
import ModyfiMotionVideo from '@/videos/Modyfi_Motion_1.mp4';
import p5SvelteVideo from '@/videos/p5_svelte.webm';

function generateId(title: string) {
  const recasedTitle = title.toLowerCase().replace(/\s/g, '-');
  return `${interactiveCardTypeAttr}.${recasedTitle}`;
}

export interface MediaItem {
  id: string;
  description?: string | React.ReactNode;
  component: React.ReactNode;
}

interface ContentItem {
  id: string;
  title: string;
  media: MediaItem[];
}

const Content: ContentItem[] = [
  {
    id: generateId('Modyfi'),
    title: 'Modyfi',
    media: [
      {
        id: 'modyfi',
        description: (
          <div className="space-y-1">
            <p>Founding team engineer of a next generation design workbench</p>
            <Link
              href="https://modyfi.com"
              className="text-blue-500 hover:text-blue-400 rounded-sm float-end"
              target="#blank"
            >
              modyfi.com/
            </Link>
          </div>
        ),
        component: (
          <Video
            src={ModyfiMotionVideo}
            aspectRatio={2161 / 1448}
            className="w-full max-w-2xl"
            eager
          />
        ),
      },
      {
        id: 'modyfi-2',
        description: (
          <div className="space-y-1">
            <p>Beep Boop</p>
            <Link
              href="https://modyfi.com"
              className="text-blue-500 hover:text-blue-400 rounded-sm float-end"
              target="#blank"
            >
              modyfi.com/welcome
            </Link>
          </div>
        ),
        component: (
          <>
            <p className="w-full max-w-2xl">Minky Hut Jr.</p>
          </>
        ),
      },
    ],
  },
  {
    id: generateId('RESET Presents'),
    title: 'RESET Presents',
    media: [
      {
        id: 'reset-presents',
        description: (
          <div className="space-y-1">
            <p>
              Presence for Chicago&apos;s premier underground event organizer
            </p>
            <Link
              href="https://resetpresents.com"
              className="text-blue-500 hover:text-blue-400 rounded-sm float-end"
              target="#blank"
            >
              resetpresents.com/
            </Link>
          </div>
        ),
        component: (
          <Image
            src={ResetPresents}
            alt="Reset Presents"
            className="w-full max-w-md select-none pointer-events-none"
          />
        ),
      },
    ],
  },
  {
    id: generateId('p5-Svelte'),
    title: 'p5-Svelte',
    media: [
      {
        id: 'p5-Svelte',
        description: 'Easily add p5 sketches to a Svelte project 🍛 🌱',
        component: (
          <Video
            src={p5SvelteVideo}
            aspectRatio={1454 / 1054}
            className="w-full max-w-xs"
            eager={false}
          />
        ),
      },
    ],
  },
  {
    id: generateId('Vague Data'),
    title: 'Vague Data',
    media: [
      {
        id: 'vague-data',
        description: 'A data tool',
        component: (
          <div className="p-2">
            <div>Hello</div>
            <div>Hello</div>
            <div>Hello</div>
            <div>Hello</div>
          </div>
        ),
      },
    ],
  },
];

export const PositionedContent = Content.map((content, index) => ({
  ...content,
  left: index * 10,
  top: index * 10,
}));
