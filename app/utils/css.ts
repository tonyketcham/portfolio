import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

/**
 * Shorthand for twMerge(clsx(...inputs))
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
