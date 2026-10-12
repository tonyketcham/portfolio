'use client';

import { useGame } from '../state/store';
import { Boot, IntroChrome, TopBar } from './Chrome';
import { Chat, ContextMenu, Dialogue, LevelUp, XpDrops } from './Game';
import { BuildMenu, LoadingBox } from './HouseHud';
import { Inspector } from './Inspector';
import { Minimap } from './Minimap';
import { ClickCrosses, Fps, MouseoverText, Overheads, SelectionOverlay } from './Overlays';
import { SidePanel, TabBar } from './Panels';

export function Hud() {
  const stage = useGame((s) => s.stage);
  const inspecting = useGame((s) => !!s.inspecting);
  const dialogue = useGame((s) => !!s.dialogue);
  const tab = useGame((s) => s.tab);
  const inWorld = stage === 'world';

  return (
    <>
      {/* world-tracking overlays live outside the scaled HUD */}
      <div className="ow-overlays">
        {inWorld && <SelectionOverlay />}
        <Overheads />
        <ClickCrosses />
      </div>

      {stage === 'boot' && <Boot />}
      {(stage === 'artboard' || stage === 'unfolding') && <IntroChrome />}

      <div className="ow-hud" data-visible={inWorld} data-inspecting={inspecting} data-tab={tab ?? 'none'}>
        {inWorld && (
          <>
            <TopBar />
            <MouseoverText />
            <Minimap />
            <XpDrops />
            {!inspecting && <Chat />}
            {!dialogue && !inspecting && <SidePanel />}
            {!inspecting && <TabBar />}
            <Dialogue />
            <Inspector />
            <LevelUp />
            <BuildMenu />
            <Fps />
          </>
        )}
      </div>
      <ContextMenu />
      <LoadingBox />
    </>
  );
}
