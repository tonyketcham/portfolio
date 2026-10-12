'use client';

import { Physics } from '@react-three/rapier';
import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { useTweaks } from '../debug/tweaks';
import { runtime } from '../state/runtime';
import { useGame } from '../state/store';
import { Artboards } from './Artboards';
import { Cables } from './Cables';
import { CameraRig, IntroDirector, TravelDirector } from './Director';
import { Environment } from './Environment';
import { Fixtures } from './Fixtures';
import { Flora } from './Flora';
import { House } from './House';
import { Interaction } from './Interaction';
import { Ambient, Particles } from './Particles';
import { Player } from './Player';
import { PostStack } from './PostStack';
import { Critters, Drops, Letters } from './Props';
import { RewindRecorder } from './Rewind';
import { Shrooms } from './Shrooms';
import { Terrain } from './Terrain';
import { Butterflies, Clouds } from './Wildlife';

/** One broken system shouldn't take the whole world down with it. */
class Safe extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(`[otherworld] ${this.props.name} crashed and was removed from the scene`, error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function PhysicsReady() {
  useEffect(() => {
    runtime.physicsReady = true;
  }, []);
  return null;
}

/** Everything on the island; hidden (not unmounted) while you're at home. */
function Island({ children }: { children: ReactNode }) {
  const onIsland = useGame((s) => s.location === 'island' && s.stage === 'world');
  return (
    <group visible={onIsland} name="island">
      {children}
    </group>
  );
}

export function Scene() {
  const gravity = useTweaks((t) => t.Physics.gravity);
  const colliders = useTweaks((t) => t.Physics.colliders);
  const booting = useGame((s) => s.stage === 'boot');

  return (
    <>
      <Environment />
      <CameraRig />
      <IntroDirector />
      <TravelDirector />
      <Interaction />
      <PostStack />
      <Suspense fallback={null}>
        <Physics gravity={[0, gravity, 0]} debug={colliders} paused={booting}>
          <PhysicsReady />
          <Safe name="house">
            <House />
          </Safe>
          <Island>
            <Safe name="terrain">
              <Terrain />
            </Safe>
            <Safe name="artboards">
              <Artboards />
            </Safe>
            <Safe name="cables">
              <Cables />
            </Safe>
            <Safe name="flora">
              <Flora />
            </Safe>
            <Safe name="shrooms">
              <Shrooms />
            </Safe>
            <Safe name="fixtures">
              <Fixtures />
            </Safe>
            <Safe name="critters">
              <Critters />
            </Safe>
            <Safe name="wildlife">
              <Butterflies />
              <Clouds />
            </Safe>
            <Safe name="ambient">
              <Ambient />
            </Safe>
          </Island>
          <Safe name="player">
            <Player />
          </Safe>
          <Safe name="letters">
            <Letters />
          </Safe>
          <Safe name="drops">
            <Drops />
          </Safe>
          <RewindRecorder />
        </Physics>
      </Suspense>
      <Safe name="particles">
        <Particles />
      </Safe>
    </>
  );
}
