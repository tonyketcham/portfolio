import { TransformBounds } from '@/app/TransformBounds';
import { cn } from '@/app/utils/css';
import { InPortal } from '@/app/utils/InPortal';
import {
  autoPlacement,
  autoUpdate,
  offset,
  useFloating,
  useMergeRefs,
} from '@floating-ui/react';
import { useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useHover } from 'usehooks-ts';

export const interactiveCardTypeAttr = 'editor.card';

export type InteractiveCardProps = {
  id: string;
  dragContainer?: React.RefObject<HTMLDivElement | null>;
  initialPosition?: { left: number; top: number };
  title: string;
  description?: string;
  selected: string | null;
  onPointerDown: (id: string) => void;
  renderDetails?: React.ReactNode;
};

export function InteractiveCard({
  id,
  dragContainer,
  initialPosition,
  title,
  selected,
  onPointerDown,
  renderDetails,
  children,
}: PropsWithChildren<InteractiveCardProps>) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useHover(ref as React.RefObject<HTMLElement>);
  const [isDragging, setIsDragging] = useState(false);
  const isSelected = useMemo(() => selected === title, [selected, title]);
  const isActive = isHovered || isDragging;

  const { refs, floatingStyles } = useFloating({
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
    ],
  });

  const mergedRef = useMergeRefs([ref, refs.setReference]);

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
        onPointerDown={() => onPointerDown(title)}
        className={cn(
          'w-fit',
          isSelected && 'z-10',
          selected && !isSelected && 'brightness-50 !opacity-90'
        )}
        data-type={interactiveCardTypeAttr}
        data-id={id}
      >
        <h1 className="absolute -top-6 w-max text-sm text-rock-gray-400">
          {title}
        </h1>
        {children}
      </TransformBounds>

      {renderDetails && isSelected && (
        <InPortal>
          <div
            ref={refs.setFloating}
            className="max-w-sm bg-zinc-950/80 backdrop-blur border border-blue-400 rounded px-2 py-1 text-sm text-zinc-200 font-[family-name:var(--font-chivo-mono)]"
            style={{ ...floatingStyles, filter: 'url(#aura)' }}
          >
            <div>{renderDetails}</div>
          </div>
        </InPortal>
      )}
    </>
  );
}
