import {
  InteractiveCard,
  interactiveCardTypeAttr,
} from '@/app/editor/InteractiveCard';
import React, { useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useOnClickOutside } from 'usehooks-ts';
import ResetPresents from '../../public/work/Reset Presents - Events Page-min.png';
import Image from 'next/image';
import Link from 'next/link';
import { PortalId } from '@/app/utils/InPortal';
import { Video } from '@/app/media/Video';
import ModyfiMotionVideo from '../../public/work/Modyfi_Motion_1.webp';

function remap(
  value: number,
  fromLow: number,
  fromHigh: number,
  toLow: number,
  toHigh: number
) {
  return toLow + ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow);
}

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
          <>
            <Video
              className="w-full max-w-2xl"
              src="/work/Modyfi_Motion_1.mp4"
              poster={{
                src: '/work/Modyfi_Motion_1.webp',
                data: ModyfiMotionVideo,
              }}
              eager
            />
          </>
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
            className="w-full max-w-xl select-none pointer-events-none"
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
        component: <div className="p-2"></div>,
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

const PositionedContent = Content.map((content, index) => ({
  ...content,
  left: index * 10,
  top: index * 10,
}));

export function Editor() {
  const ref = React.useRef<HTMLDivElement>(null);
  useOnClickOutside(ref as React.RefObject<HTMLElement>, (event) => {
    // Ignore clicks on the "tooltip"-like element which provides details on the card
    if (event.target instanceof Element) {
      if (event.target.closest(`#${PortalId.Topout}`)) {
        return;
      }
    }

    setSelected(null);
  });

  const [selected, setSelected] = React.useState<{
    id: string;
    mediaId: string;
  } | null>(null);

  const handleSelection = useCallback(
    (selectedId: string, selectedMediaId: string) => {
      setSelected({ id: selectedId, mediaId: selectedMediaId });
    },
    [setSelected]
  );

  /**
   * Dumps the current relative position of all the cards in the editor to the console.
   * This is useful for manually positioning the cards at a given breakpoint.
   */
  const dumpCurrentPosition = useCallback(() => {
    const cardElements = Array.from(
      document.querySelectorAll(`[data-type="${interactiveCardTypeAttr}"]`)
    ) as HTMLDivElement[];

    const container = ref.current!;

    if (!container) {
      return;
    }

    // Reduce into a map of each card's id to its relative position
    const positions = cardElements.reduce((acc, card) => {
      const id = card.getAttribute('data-id')!;
      const { left, top } = card.getBoundingClientRect();

      // convert positions to percentage of container width and height 0-100
      const leftPercentage = remap(left, 0, container.clientWidth, 0, 100);
      const topPercentage = remap(top, 0, container.clientHeight, 0, 100);

      acc[id] = { left: leftPercentage, top: topPercentage };
      return acc;
    }, {} as Record<string, { left: number; top: number }>);

    const breakpoint = container.clientWidth;
    const positionsAtBreakpoint = { breakpoint, positions };

    console.log(positionsAtBreakpoint);
  }, []);

  useHotkeys('alt+shift+d', dumpCurrentPosition);

  return (
    <section ref={ref} className="relative min-h-[720px] h-svh bg-dot">
      {/* Click to de-select */}
      <div className="absolute inset-0" onClick={() => setSelected(null)} />
      {/* Layers panel */}
      <div className="absolute left-6 inset-y-6 w-52 pointer-events-none">
        {/* <div className="bg-zinc-950/20 rounded-2xl border border-zinc-800 backdrop-blur-xs pointer-events-auto">
          <ul className="p-2">
            <li>File</li>
            <li>Edit</li>
            <li>View</li>
            <li>Insert</li>
            <li>Format</li>
            <li>Tools</li>
            <li>Help</li>
          </ul>
        </div> */}
      </div>

      {PositionedContent.map((content) => (
        <InteractiveCard
          key={content.title}
          id={content.id}
          initialPosition={{ left: content.left, top: content.top }}
          selected={selected}
          onPointerDown={handleSelection}
          dragContainer={ref}
          title={content.title}
          media={content.media}
        />
      ))}
    </section>
  );
}
