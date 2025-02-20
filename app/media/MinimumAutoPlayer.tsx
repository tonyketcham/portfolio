import type { PlayerProps } from 'next-video';
import BackgroundVideo from 'next-video/background-video';

export const MinimumAutoPlayer = (props: PlayerProps) => {
  return <BackgroundVideo {...props} />;
};
