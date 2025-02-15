import { cva } from 'class-variance-authority';

export const borderHighlightClasses = cva(['border border-blue-500'], {
  variants: {
    group: {
      true: 'group-hover:border-blue-400',
      false: 'hover:border-blue-400',
    },
  },
  defaultVariants: {
    group: false,
  },
});
