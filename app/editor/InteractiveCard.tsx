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
import { useRef, useState, useCallback, useMemo } from 'react';
import { useHover } from 'usehooks-ts';
import React from 'react';
// import { useWhyDidYouUpdate } from 'rooks';
import { useAreFilterDefinitionsSupported } from '@/app/filters/SupportedFilterDefinitionsProvider';

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

const CardHeader = ({ title }: { title: string }) => (
  <h1 className="absolute -top-6 w-max text-sm text-rock-gray-400">{title}</h1>
);

const CardMedia = ({ component }: { component: React.ReactNode }) => (
  <>{component}</>
);

const CardDescription = ({
  primaryMedia,
  secondaryMedia,
  refs,
  floatingStyles,
  setPrimaryMedia,
}: {
  primaryMedia: MediaItem;
  secondaryMedia?: MediaItem[];
  refs: ReturnType<typeof useFloating>['refs'];
  floatingStyles: ReturnType<typeof useFloating>['floatingStyles'];
  setPrimaryMedia: (media: MediaItem) => void;
}) => {
  const areFiltersSupported = useAreFilterDefinitionsSupported();

  return (
    <InPortal>
      <div
        ref={refs.setFloating}
        className="max-w-sm bg-zinc-950/80 backdrop-blur border border-blue-400 rounded px-2 py-1 text-sm text-zinc-200 font-[family-name:var(--font-chivo-mono)]"
        style={{
          ...floatingStyles,
          filter: areFiltersSupported ? 'url(#aura)' : 'none',
        }}
      >
        <div>{primaryMedia.description}</div>
        {secondaryMedia?.map((m: MediaItem) => (
          <div key={m.id} onClick={() => setPrimaryMedia(m)}>
            {m.component}
          </div>
        ))}
      </div>
    </InPortal>
  );
};

const InteractiveCardInternal = ({
  id,
  dragContainer,
  initialPosition,
  title,
  selected,
  onPointerDown,
  media,
}: InteractiveCardProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useHover(ref as React.RefObject<HTMLElement>);
  const [isDragging, setIsDragging] = useState(false);
  const isSelected = selected?.id === id;
  const isActive = isHovered || isDragging;
  const [primaryMedia, setPrimaryMedia] = useState<MediaItem>(media![0]);
  const secondaryMedia = useMemo(
    () => media?.filter((m) => m.id !== primaryMedia.id),
    [media, primaryMedia]
  );

  const [reference, setReference] = useState<HTMLElement | null>(null);
  // const { refs, floatingStyles } = useFloating({
  //   strategy: 'fixed',
  //   elements: {
  //     reference,
  //   },
  //   whileElementsMounted: autoUpdate,
  //   middleware: [
  //     offset(({ placement }) => {
  //       if (placement === 'bottom') {
  //         return { mainAxis: 32, crossAxis: 72 };
  //       }
  //       return {
  //         mainAxis: 12,
  //         crossAxis: 72,
  //       };
  //     }),
  //     autoPlacement(),
  //     hide(),
  //   ],
  // });

  const mergedRef = useMergeRefs([ref, setReference]);

  const handleDragStart = useCallback(() => setIsDragging(true), []);
  const handleDragEnd = useCallback(() => setIsDragging(false), []);
  const handlePointerDown = useCallback(
    () => onPointerDown(id, primaryMedia.id),
    [id, primaryMedia.id, onPointerDown]
  );

  // useWhyDidYouUpdate('InteractiveCardInternal', {
  //   id,
  //   dragContainer,
  //   initialPosition,
  //   title,
  //   selected,
  //   onPointerDown,
  //   media,
  //   isDragging,
  //   isSelected,
  //   isHovered,
  //   primaryMedia,
  //   secondaryMedia,
  //   reference,
  //   // refs,
  //   // floatingStyles,
  //   mergedRef,
  // });

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
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onPointerDown={handlePointerDown}
        className={cn(
          'absolute w-fit',
          isSelected && 'z-10',
          selected && !isSelected && 'brightness-50 !opacity-90'
        )}
        data-type={interactiveCardTypeAttr}
        data-id={id}
      >
        <CardHeader title={title} />
        <CardMedia component={primaryMedia.component} />
      </TransformBounds>

      {/* {primaryMedia.description && isSelected && (
        <CardDescription
          primaryMedia={primaryMedia}
          secondaryMedia={secondaryMedia}
          refs={refs}
          floatingStyles={floatingStyles}
          setPrimaryMedia={setPrimaryMedia}
        />
      )} */}
    </>
  );
};

export const InteractiveCard = React.memo(InteractiveCardInternal);
