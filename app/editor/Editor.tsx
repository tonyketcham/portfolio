import {
  InteractiveCard,
  interactiveCardTypeAttr,
} from '@/app/editor/InteractiveCard';
import React, { useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useOnClickOutside } from 'usehooks-ts';
import { PortalId } from '@/app/utils/InPortal';
import { remap } from '@/app/utils/math';
import { PositionedContent } from '@/app/editor/Content';

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
    <section ref={ref} className="flex relative min-h-[720px] h-dvh bg-dot">
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

      <h2
        className="absolute top-3 left-1.5 text-xl font-light text-rock-gray-400 drop-shadow-lg"
        style={{
          writingMode: 'sideways-lr',
        }}
      >
        work
      </h2>

      {PositionedContent.map((content) => (
        <InteractiveCard
          key={content.id}
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
