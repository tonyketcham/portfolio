import dynamic from 'next/dynamic';

export const ChromaticAberrationFilter = dynamic(
  () => import('./ChromaticAberrationFilter.client'),
  {
    ssr: false,
  }
);
