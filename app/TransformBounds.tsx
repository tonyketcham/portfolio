'use client';

import { cn } from '@/app/utils/css';
import { AnimatePresence } from 'motion/react';
import { motion } from 'motion/react';
import {
  useRef,
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';

interface TransformBoundsProps {
  showContainmentBounds?: Partial<{
    left: boolean;
    top: boolean;
    right: boolean;
    bottom: boolean;
  }>;
  renderDimensionFeedbackOnHover?: ReactNode;
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
  renderDimensionFeedbackOnHover = null,
  className,
  children,
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
      <motion.div
        className={cn('relative group', className)}
        ref={containerRef}
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Child content */}
        {children}

        {/* Dotted lines extending to parent boundaries */}
        <motion.div
          className="z-50 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {showContainmentBounds.left && (
            <div
              className="absolute left-0 border-t border-dashed border-blue-500 group-hover:border-blue-400"
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
              className="absolute right-0 border-t border-dashed border-blue-500 group-hover:border-blue-400"
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
              className="absolute top-0 border-l border-dashed border-blue-500 group-hover:border-blue-400"
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
              className="absolute bottom-0 border-l border-dashed border-blue-500 group-hover:border-blue-400"
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
          className="absolute inset-0 border border-blue-500 group-hover:border-blue-400 z-50"
          style={{
            width: bounds.width,
            height: bounds.height,
            filter: `url(#aura)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.3 }}
        />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.2 }}
        >
          {/* Corner indicators */}
          <div className="absolute -left-1 -top-1 h-2 w-2 rounded-sm bg-white border-2 border-blue-500 group-hover:border-blue-400 z-50" />
          <div className="absolute -right-1 -top-1 h-2 w-2 rounded-sm bg-white border-2 border-blue-500 group-hover:border-blue-400 z-50" />
          <div className="absolute -left-1 -bottom-1 h-2 w-2 rounded-sm bg-white border-2 border-blue-500 group-hover:border-blue-400 z-50" />
          <div className="absolute -right-1 -bottom-1 h-2 w-2 rounded-sm bg-white border-2 border-blue-500 group-hover:border-blue-400 z-50" />
        </motion.div>

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
                className="w-fit bg-blue-500 text-white text-xs mx-auto px-1 py-px rounded select-none tabular-nums"
              >
                <div
                  className={cn(
                    'flex-shrink-0 hidden',
                    Boolean(renderDimensionFeedbackOnHover) &&
                      'group-hover:flex'
                  )}
                >
                  {renderDimensionFeedbackOnHover}
                </div>
                <div
                  className={cn(
                    'flex flex-shrink-0',
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
      </motion.div>
    </>
  );
}
