'use client';

import { useGame } from '../state/store';
import { cancelCatchUse } from '../state/catch-actions';
import { itemName } from '../state/items';
import { Book } from './Book';
import { Boot, IntroChrome, TopBar } from './Chrome';
import { Chat, ContextMenu, Dialogue, LevelUp, XpDrops } from './Game';
import { BuildMenu, LoadingBox } from './HouseHud';
import { Inspector } from './Inspector';
import { Minimap } from './Minimap';
import { FishingSpotIcons } from './FishingSpotIcons';
import { ClickCrosses, Fps, MouseoverText, OverheadPrayer, Overheads, SelectionOverlay } from './Overlays';
import { SidePanel, TabBar } from './Panels';

function CatchUseHint() {
  const using = useGame((s) => s.usingCatch);
  if (!using) return null;
  return <div className="ow-catch-use ow-panel" role="status">
    <span>Use <b>{itemName(using.stack)}</b> on a world object</span>
    <button className="ow-x" onClick={cancelCatchUse} aria-label="Cancel item use">×</button>
  </div>;
}

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
        {inWorld && <OverheadPrayer />}
        {inWorld && <FishingSpotIcons />}
        <Overheads />
        <ClickCrosses />
      </div>

      {stage === 'boot' && <Boot />}
      {(stage === 'artboard' || stage === 'unfolding') && <IntroChrome />}

      <div className="ow-hud" data-visible={inWorld} data-inspecting={inspecting} data-tab={tab ?? 'none'}>
        {inWorld && (
          <>
            <TopBar />
            <CatchUseHint />
            <MouseoverText />
            <Minimap />
            <XpDrops />
            {!inspecting && <Chat />}
            {!dialogue && !inspecting && <SidePanel />}
            {!inspecting && <TabBar />}
            <Dialogue />
            <Book />
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
