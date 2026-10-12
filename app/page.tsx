'use client';

import dynamic from 'next/dynamic';
import './otherworld/hud/hud.css';

/**
 * The portfolio is a canvas that unfolds into a world. The previous homepage
 * lives on at /classic (and is the fallback without WebGL2).
 */
const Otherworld = dynamic(() => import('./otherworld/Otherworld'), {
  ssr: false,
  loading: () => (
    <div className="ow-root" data-skin="tool" data-stage="boot">
      <div className="ow-boot">
        <div className="ow-boot-file">Untitled-1.canvas</div>
      </div>
    </div>
  ),
});

export default function Home() {
  return <Otherworld />;
}
