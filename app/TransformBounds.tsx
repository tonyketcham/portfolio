'use client';

import { useAreFilterDefinitionsSupported } from '@/app/filters/SupportedFilterDefinitionsProvider';
import { cn } from '@/app/utils/css';
import { AnimatePresence } from 'motion/react';
import { motion } from 'motion/react';
import {
  useRef,
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactNode,
  forwardRef,
  type ComponentProps,
  useCallback,
} from 'react';
import { useMergeRefs } from 'rooks';

type TransformBoundsProps = {
  dragContainer?: React.RefObject<HTMLDivElement | null>;
  initialPosition?: { left: number; top: number };
  showContainmentBounds?: Partial<{
    left: boolean;
    top: boolean;
    right: boolean;
    bottom: boolean;
  }>;
  showTransformHandles?: boolean;
  renderDimensionFeedbackOnHover?: ReactNode;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onPointerDown?: () => void;
} & ComponentProps<typeof motion.div>;

/**
 * Mimics the transform bounding box typical in design tools when an element is selected.
 *
 */
export const TransformBounds = forwardRef<
  HTMLDivElement,
  PropsWithChildren<TransformBoundsProps>
>(
  (
    {
      dragContainer,
      initialPosition = { left: 0, top: 0 },
      showContainmentBounds = {
        left: true,
        top: true,
        right: false,
        bottom: false,
      },
      showTransformHandles = true,
      renderDimensionFeedbackOnHover = null,
      onDragStart,
      onDragEnd,
      onPointerDown,
      className,
      children,
      ...props
    }: PropsWithChildren<TransformBoundsProps>,
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const [bounds, setBounds] = useState({ width: 0, height: 0 });
    const [parentBounds, setParentBounds] = useState({ width: 0, height: 0 });

    const updateBoundsForElement = useCallback(
      (
        element: HTMLElement | null,
        onResize: (width: number, height: number) => void
      ) => {
        if (!element) return;
        const { width, height } = element.getBoundingClientRect();
        onResize(width, height);
      },
      []
    );

    const updateBounds = useCallback(() => {
      updateBoundsForElement(containerRef.current, (width, height) => {
        setBounds((prevBounds) => {
          if (prevBounds.width !== width || prevBounds.height !== height) {
            return { width, height };
          }
          return prevBounds;
        });
      });
      updateBoundsForElement(document.body, (width, height) => {
        setParentBounds((prevParentBounds) => {
          if (
            prevParentBounds.width !== width ||
            prevParentBounds.height !== height
          ) {
            return { width, height };
          }
          return prevParentBounds;
        });
      });
    }, [updateBoundsForElement]);

    useEffect(() => {
      updateBounds();

      const observeElement = (element: HTMLElement | null) => {
        if (!element) return;
        const resizeObserver = new ResizeObserver(() =>
          updateBoundsForElement(element, (width, height) => {
            if (element === containerRef.current) {
              setBounds((prevBounds) => {
                if (
                  prevBounds.width !== width ||
                  prevBounds.height !== height
                ) {
                  return { width, height };
                }
                return prevBounds;
              });
            } else if (element === document.body) {
              setParentBounds((prevParentBounds) => {
                if (
                  prevParentBounds.width !== width ||
                  prevParentBounds.height !== height
                ) {
                  return { width, height };
                }
                return prevParentBounds;
              });
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
    }, [updateBoundsForElement, updateBounds]);

    const mergedRef = useMergeRefs(containerRef, ref);
    const areFiltersSupported = useAreFilterDefinitionsSupported();

    return (
      <>
        <motion.div
          ref={mergedRef}
          drag
          dragConstraints={dragContainer || containerRef}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onPointerDown={onPointerDown}
          className={cn('relative group cursor-grab', className)}
          style={{
            left: `${initialPosition.left}%`,
            top: `${initialPosition.top}%`,
          }}
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          whileTap={{ cursor: 'grabbing' }}
          {...props}
        >
          {/* Child content */}
          {children}

          {/* Dotted lines extending to parent boundaries */}
          <motion.div
            className="pointer-events-none opacity-0 group-hover:opacity-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            {showContainmentBounds.left && (
              <div
                className="absolute z-50 left-0 border-t border-dashed border-blue-500 group-hover:border-blue-400"
                style={{
                  width: `${parentBounds.width - bounds.width}px`,
                  transform: `translateY(-${bounds.height / 2}px) translateX(-${
                    parentBounds.width - bounds.width
                  }px)`,
                }}
              />
            )}

            {showContainmentBounds.right && (
              <div
                className="absolute z-50 right-0 border-t border-dashed border-blue-500 group-hover:border-blue-400"
                style={{
                  width: `${parentBounds.width - bounds.width}px`,
                  transform: `translateY(-${bounds.height / 2}px) translateX(${
                    parentBounds.width - bounds.width
                  }px)`,
                }}
              />
            )}

            {showContainmentBounds.top && (
              <div
                className="absolute z-50 top-0 border-l border-dashed border-blue-500 group-hover:border-blue-400"
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
                className="absolute z-50 bottom-0 border-l border-dashed border-blue-500 group-hover:border-blue-400"
                style={{
                  height: `${parentBounds.height - bounds.height}px`,
                  transform: `translateX(${bounds.width / 2}px) translateY(${
                    parentBounds.height - bounds.height
                  }px)`,
                }}
              />
            )}
          </motion.div>

          {/* Bounding box */}
          <motion.div
            className="absolute inset-0 border border-blue-500 group-hover:border-blue-400 z-50 pointer-events-none"
            style={{
              width: bounds.width,
              height: bounds.height,
              filter: areFiltersSupported ? 'url(#aura)' : 'none',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.3 }}
          />

          <AnimatePresence>
            {showTransformHandles && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.2 }}
              >
                {/* Corner indicators */}
                <div className="absolute -left-1 -top-1 h-2 w-2 rounded-xs bg-white border-2 border-blue-500 group-hover:border-blue-400 z-50" />
                <div className="absolute -right-1 -top-1 h-2 w-2 rounded-xs bg-white border-2 border-blue-500 group-hover:border-blue-400 z-50" />
                <div className="absolute -left-1 -bottom-1 h-2 w-2 rounded-xs bg-white border-2 border-blue-500 group-hover:border-blue-400 z-50" />
                <div className="absolute -right-1 -bottom-1 h-2 w-2 rounded-xs bg-white border-2 border-blue-500 group-hover:border-blue-400 z-50" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dimensions feedback */}
          <AnimatePresence>
            {bounds.width && bounds.height && (
              <motion.div
                className="absolute -bottom-7 inset-x-0 pointer-events-none z-50"
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.6 }}
              >
                <motion.div
                  layout
                  className="w-fit bg-blue-500 text-white text-xs mx-auto px-1 py-px rounded-sm select-none tabular-nums"
                >
                  <div
                    className={cn(
                      'shrink-0 hidden',
                      Boolean(renderDimensionFeedbackOnHover) &&
                        'group-hover:flex'
                    )}
                  >
                    {renderDimensionFeedbackOnHover}
                  </div>
                  <div
                    className={cn(
                      'flex shrink-0',
                      Boolean(renderDimensionFeedbackOnHover) &&
                        'group-hover:hidden'
                    )}
                  >
                    {Math.round(bounds.width)}{' '}
                    <span className="opacity-70">x</span>{' '}
                    {Math.round(bounds.height)}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* TODO: Implement rotation handle */}
          {/* <div className="absolute -top-6 inset-x-0">
            <div className="mx-auto w-3 h-3 bg-blue-200 rounded-2xl border-2 border-blue-500 group-hover:border-blue-400 cursor-pointer" />
          </div> */}
        </motion.div>
      </>
    );
  }
);

TransformBounds.displayName = 'TransformBounds';
