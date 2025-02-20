import { MediaController } from 'media-chrome/react';

const MinimumAutoPlayer = () => {
  return (
    <MediaController>
      <video
        slot="media"
        src="https://stream.mux.com/DS00Spx1CV902MCtPj5WknGlR102V5HFkDe/high.mp4"
        preload="auto"
        muted
        playsInline
        loop
        crossOrigin=""
      />
    </MediaController>
  );
};

export default MinimumAutoPlayer;
