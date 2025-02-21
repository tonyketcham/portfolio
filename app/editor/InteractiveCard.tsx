import type { MediaItem } from '@/app/editor/Editor';
import { TransformBounds } from '@/app/TransformBounds';
import { cn } from '@/app/utils/css';
import { InPortal } from '@/app/utils/InPortal';
import {
  autoPlacement,
  autoUpdate,
  hide,
  offset,
  useFloating,
  useMergeRefs,
} from '@floating-ui/react';
import { useMemo, useRef, useState } from 'react';
import { useHover } from 'usehooks-ts';

export const interactiveCardTypeAttr = 'editor.card';

export type InteractiveCardProps = {
  id: string;
  dragContainer?: React.RefObject<HTMLDivElement | null>;
  initialPosition?: { left: number; top: number };
  title: string;
  description?: string;
  selected: { id: string; mediaId: string } | null;
  onPointerDown: (id: string, mediaId: string) => void;
  media?: MediaItem[];
};

export function InteractiveCard({
  id,
  dragContainer,
  initialPosition,
  title,
  selected,
  onPointerDown,
  media,
}: InteractiveCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useHover(ref as React.RefObject<HTMLElement>);
  const [isDragging, setIsDragging] = useState(false);
  const isSelected = useMemo(() => selected?.id === id, [selected?.id, id]);
  const isActive = isHovered || isDragging;
  const [primaryMedia, setPrimaryMedia] = useState<MediaItem>(media![0]);
  const secondaryMedia = useMemo(
    () => media?.filter((m) => m.id !== primaryMedia.id),
    [media, primaryMedia]
  );

  // Floating UI's inbuilt ref does not cause changes to the reference component to reactively update and can cause the floating element to become orphaned on swap
  // This bit of state ensures that swapping the primary media will update the floating UI anchor to follow the new media component
  const [reference, setReference] = useState<HTMLElement | null>(null);
  const { refs, floatingStyles } = useFloating({
    strategy: 'fixed',
    elements: {
      reference,
    },
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(({ placement }) => {
        if (placement === 'bottom') {
          return { mainAxis: 32, crossAxis: 72 };
        }
        return {
          mainAxis: 12,
          crossAxis: 72,
        };
      }),
      autoPlacement(),
      hide(),
    ],
  });

  const mergedRef = useMergeRefs([ref, setReference]);

  return (
    <>
      <TransformBounds
        dragContainer={dragContainer}
        initialPosition={initialPosition}
        ref={mergedRef}
        showContainmentBounds={{
          left: isActive,
          top: isActive,
          right: isActive,
          bottom: isActive,
        }}
        showTransformHandles={isSelected}
        dragMomentum={false}
        viewport={{ once: true }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setIsDragging(false)}
        onPointerDown={() => onPointerDown(id, primaryMedia.id)}
        className={cn(
          'absolute w-fit',
          isSelected && 'z-10',
          selected && !isSelected && 'brightness-50 !opacity-90'
        )}
        data-type={interactiveCardTypeAttr}
        data-id={id}
      >
        <h1 className="absolute -top-6 w-max text-sm text-rock-gray-400">
          {title}
        </h1>
        {primaryMedia.component}
      </TransformBounds>

      {primaryMedia.description && isSelected && (
        <InPortal>
          <div
            ref={refs.setFloating}
            className="max-w-sm bg-zinc-950/80 backdrop-blur border border-blue-400 rounded px-2 py-1 text-sm text-zinc-200 font-[family-name:var(--font-chivo-mono)]"
            style={{ ...floatingStyles, filter: 'url(#aura)' }}
          >
            <div>{primaryMedia.description}</div>
            {secondaryMedia?.map((m) => (
              <div key={m.id} onClick={() => setPrimaryMedia(m)}>
                {m.component}
              </div>
            ))}
          </div>
        </InPortal>
      )}
    </>
  );
}
