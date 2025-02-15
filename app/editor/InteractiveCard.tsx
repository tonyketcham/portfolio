import { TransformBounds } from '@/app/TransformBounds';
import { useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useHover } from 'usehooks-ts';

export interface InteractiveCardProps {
  dragContainer?: React.RefObject<HTMLDivElement | null>;
  title: string;
  description?: string;
  selected: string | null;
  onPointerDown: (id: string) => void;
}

export function InteractiveCard({
  dragContainer,
  title,
  selected,
  onPointerDown,
  children,
}: PropsWithChildren<InteractiveCardProps>) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useHover(ref as React.RefObject<HTMLElement>);
  const [isDragging, setIsDragging] = useState(false);
  const isSelected = useMemo(() => selected === title, [selected, title]);
  const isActive = isHovered || isDragging;

  return (
    <TransformBounds
      dragContainer={dragContainer}
      ref={ref}
      showContainmentBounds={{
        left: isActive,
        top: isActive,
        right: isActive,
        bottom: isActive,
      }}
      showTransformHandles={isSelected}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      onPointerDown={() => onPointerDown(title)}
      className="w-fit"
    >
      <h1 className="absolute -top-6 w-max text-sm text-rock-gray-400">
        {title}
      </h1>
      {children}
    </TransformBounds>
  );
}
