'use client';

import { cn } from '@/app/utils/css';
import { useRef, useEffect, useState, type PropsWithChildren } from 'react';

interface TransformBoundsProps {
  showContainmentBounds?: Partial<{
    left: boolean;
    top: boolean;
    right: boolean;
    bottom: boolean;
  }>;
  className?: string;
}

/**
 * Mimics the transform bounding box typical in design tools when an element is selected.
 *
 */
export function TransformBounds({
  showContainmentBounds = {
    left: true,
    top: true,
    right: false,
    bottom: false,
  },
  children,
  className,
}: PropsWithChildren<TransformBoundsProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [parentBounds, setParentBounds] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateBoundsForElement = (
      element: HTMLElement | null,
      onResize: (width: number, height: number) => void
    ) => {
      if (!element) return;
      // Get element bounds
      const { width, height } = element.getBoundingClientRect();
      onResize(width, height);
    };

    const updateBounds = () => {
      updateBoundsForElement(containerRef.current, (width, height) => {
        setBounds({ width, height });
      });
      updateBoundsForElement(document.body, (width, height) => {
        setParentBounds({ width, height });
      });
    };

    updateBounds();

    const observeElement = (element: HTMLElement | null) => {
      if (!element) return;
      const resizeObserver = new ResizeObserver(() =>
        updateBoundsForElement(element, (width, height) => {
          if (element === containerRef.current) {
            setBounds({ width, height });
          } else if (element === document.body) {
            setParentBounds({ width, height });
          }
        })
      );
      resizeObserver.observe(element);
      return resizeObserver;
    };

    const containerObserver = observeElement(containerRef.current);
    const bodyObserver = observeElement(document.body);

    return () => {
      containerObserver?.disconnect();
      bodyObserver?.disconnect();
    };
  }, []);

  return (
    <>
      <div className={cn('relative', className)} ref={containerRef}>
        {/* Dotted lines extending to parent boundaries */}
        {showContainmentBounds.left && (
          <div
            className="absolute left-0 border-t border-dashed border-blue-500"
            style={{
              width: `${parentBounds.width - bounds.width}px`,
              transform: `translateY(${bounds.height / 2}px) translateX(-${
                parentBounds.width - bounds.width
              }px)`,
            }}
          />
        )}

        {showContainmentBounds.right && (
          <div
            className="absolute right-0 border-t border-dashed border-blue-500"
            style={{
              width: `${parentBounds.width - bounds.width}px`,
              transform: `translateY(${bounds.height / 2}px) translateX(${
                parentBounds.width - bounds.width
              }px)`,
            }}
          />
        )}

        {showContainmentBounds.top && (
          <div
            className="absolute top-0 border-l border-dashed border-blue-500"
            style={{
              height: `${parentBounds.height - bounds.height}px`,
              transform: `translateX(${bounds.width / 2}px) translateY(-${
                parentBounds.height - bounds.height
              }px)`,
            }}
          />
        )}

        {showContainmentBounds.bottom && (
          <div
            className="absolute bottom-0 border-l border-dashed border-blue-500"
            style={{
              height: `${parentBounds.height - bounds.height}px`,
              transform: `translateX(${bounds.width / 2}px) translateY(${
                parentBounds.height - bounds.height
              }px)`,
            }}
          />
        )}

        {/* Bounding box */}
        <div
          className="absolute inset-0 border border-blue-500"
          style={{
            width: bounds.width,
            height: bounds.height,
          }}
        />

        {/* Corner indicators */}
        <div className="absolute -left-1 -top-1 h-2 w-2 rounded-sm bg-white border-2 border-blue-500" />
        <div className="absolute -right-1 -top-1 h-2 w-2 rounded-sm bg-white border-2 border-blue-500" />
        <div className="absolute -left-1 -bottom-1 h-2 w-2 rounded-sm bg-white border-2 border-blue-500" />
        <div className="absolute -right-1 -bottom-1 h-2 w-2 rounded-sm bg-white border-2 border-blue-500" />

        {/* Child content */}
        {children}
      </div>
    </>
  );
}
