'use client';

/**
 * The Underpass: RESET's basement under the Figma zone. Stone walls cut away
 * on the camera side, damp concrete, purple torches, the events page hung on
 * the north wall, the year monoliths, the decks, and the ladder back up.
 * Hidden (not unmounted) while you're anywhere else.
 */
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playSecretTrack } from '../audio/music';
import { SECRET_TRACK, TRACKS } from '../audio/tracks';
import { canvasTexture } from '../house/furniture/common';
import { Kit } from '../house/kit';
import { fireMaterial, furnitureMaterial, glowMaterial } from '../house/materials';
import { cssFont } from '../lib/textures';
import { createBasementFloorMaterial } from '../shaders/basement';
import { travel } from '../state/actions';
import { emit, sfx } from '../state/events';
import { gameState, useGame } from '../state/store';
import { BASEMENT, getBasement } from '../world/basement';
import { getWorld, type Fixture } from '../world/map';
import { basementTiles } from '../world/places';
import { WorkArtboard } from './Artboards';
import { trapdoor } from './Figma';
import { Door, Monolith, useFixture } from './Fixtures';
import { beat } from './beat';
import { Label } from './Label';

const { w: W, h: H, ox, oz, wall: WALL, low: LOW } = BASEMENT;
const STONES = ['#3f3f46', '#44403c', '#3a3a40', '#4a4a52', '#34343a'];
const TORCH: [string, string, string] = ['#312e81', '#818cf8', '#e0e7ff'];
/** The ladder hole in the ceiling, over the ladder. */
const HOLE = { x: ox + 3.5, z: oz + 1.5 };
const TORCHES: [number, number][] = [
  [ox + 6.4, oz + 1.08],
  [ox + 11.8, oz + 1.08],
  [ox + 1.08, oz + 5.2],
  [ox + 1.08, oz + 9],
];

/** Whether a set is on, shared by the decks, the lights and the lasers. */
const party = { on: false, until: 0 };

// ── the room ─────────────────────────────────────────────────────────────────
type Side = 'n' | 's' | 'e' | 'w';
const SIDES: Side[] = ['n', 's', 'e', 'w'];
/** Walls the camera is behind, cut to knee height. Anything hung on a wall hides with it. */
const wallCut: Record<Side, boolean> = { n: false, s: false, e: false, w: false };
const torchSide = (x: number, z: number): Side => (z < oz + 1.5 ? 'n' : 'w');

/** One side of the cellar in staggered stone courses (north/south run the full width). */
function buildWall(side: Side, height: number) {
  const k = new Kit(53 + SIDES.indexOf(side));
  const stone = () => STONES[Math.floor(k.r() * STONES.length)];
  const course = height > 1 ? 0.5 : height;
  const rows = Math.round(height / course);
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? 0.5 : 0;
    const y = row * course + course / 2;
    if (side === 'n' || side === 's') {
      const z = side === 'n' ? oz + 0.5 : oz + H - 0.5;
      for (let x = -off; x < W; x += 1) {
        const x0 = Math.max(0, x);
        const x1 = Math.min(W, x + 1);
        k.box(x1 - x0 - 0.02, course - 0.03, 1, stone(), [ox + (x0 + x1) / 2, y, z]);
      }
    } else {
      const x = side === 'w' ? ox + 0.5 : ox + W - 0.5;
      for (let z = 1 - off; z < H - 1; z += 1) {
        const z0 = Math.max(1, z);
        const z1 = Math.min(H - 1, z + 1);
        k.box(1, course - 0.03, z1 - z0 - 0.02, stone(), [x, y, oz + (z0 + z1) / 2]);
      }
    }
  }
  if (height > 1) {
    if (side === 'n') {
      // timber trimmer round the ladder hole, jutting out of the wall
      const y = WALL + 0.1;
      for (const dx of [-0.6, 0.6]) k.box(0.18, 0.2, 1.2, '#4a3526', [HOLE.x + dx, y, oz + 1.6]);
      k.box(1.38, 0.2, 0.18, '#4a3526', [HOLE.x, y, oz + 2.12]);
    }
    // torch brackets
    for (const [x, z] of TORCHES) if (torchSide(x, z) === side) k.box(0.08, 0.3, 0.08, '#18181b', [x, 1.85, z]);
  }
  return k.build()!;
}

function Room() {
  const light = useRef<THREE.PointLight>(null);
  const shaft = useRef<THREE.MeshBasicMaterial>(null);
  const floorMaterial = useMemo(() => createBasementFloorMaterial(basementTiles.texture), []);

  const walls = useMemo(() => SIDES.map((side) => ({ side, tall: buildWall(side, WALL), low: buildWall(side, LOW) })), []);
  const wallRefs = useRef<Partial<Record<string, THREE.Mesh | null>>>({});
  const torchRefs = useRef<(THREE.Group | null)[]>([]);

  const floorBits = useMemo(() => {
    const k = new Kit(57);
    // wires: down the ladder from the Figma hub, across the floor into the decks
    k.tube(
      [
        [HOLE.x - 0.35, WALL, oz + 1.15],
        [HOLE.x - 0.4, 1.2, oz + 1.12],
        [HOLE.x - 0.5, 0.04, oz + 1.6],
        [ox + 5.5, 0.03, oz + 5],
        [ox + 7.2, 0.03, oz + 9.3],
        [ox + 7.6, 0.03, oz + 10.4],
      ],
      0.035,
      '#6366f1',
      { jitter: 0, seg: 80 }
    );
    k.tube(
      [
        [ox + 9, 0.04, oz + 2.3],
        [ox + 9.8, 0.03, oz + 5],
        [ox + 8.7, 0.03, oz + 8.5],
        [ox + 8.4, 0.03, oz + 10.4],
      ],
      0.03,
      '#a259ff',
      { jitter: 0, seg: 60 }
    );
    return k.build()!;
  }, []);

  const flames = useMemo(() => fireMaterial(TORCH), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // walls between the camera and the room drop to knee height
    const cx = state.camera.position.x - (ox + W / 2);
    const cz = state.camera.position.z - (oz + H / 2);
    wallCut.n = cz < -(H / 2 - 1);
    wallCut.s = cz > H / 2 - 1;
    wallCut.w = cx < -(W / 2 - 1);
    wallCut.e = cx > W / 2 - 1;
    for (const side of SIDES) {
      const tall = wallRefs.current[side + ':tall'];
      const low = wallRefs.current[side + ':low'];
      if (tall) tall.visible = !wallCut[side];
      if (low) low.visible = wallCut[side];
    }
    TORCHES.forEach(([x, z], i) => {
      const g = torchRefs.current[i];
      if (g) g.visible = !wallCut[torchSide(x, z)];
    });
    const b = beat(t);
    const on = party.on || b.live ? 1 : 0;
    if (light.current) {
      light.current.intensity = 12 + b.bass * 8 + b.kick * (5 + on * 22) + Math.sin(t * 9) * 0.6;
      light.current.color.setHSL(on ? 0.66 + Math.sin(t * 0.6) * 0.1 + b.high * 0.08 : 0.67, 0.75, 0.6 + b.mid * 0.08, THREE.SRGBColorSpace);
    }
    // torches lick upwards with the mids
    torchRefs.current.forEach((g, i) => g && g.scale.set(1, 0.85 + b.mid * 0.5 + b.kick * 0.25 * on + Math.sin(t * 11 + i) * 0.05, 1));
    if (shaft.current) shaft.current.opacity = 0.05 + Math.sin(t * 0.8) * 0.01;
  });

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[ox + W / 2, 0, oz + H / 2]} material={floorMaterial} receiveShadow>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh geometry={floorBits} material={furnitureMaterial} receiveShadow />
      {walls.map(({ side, tall, low }) => (
        <group key={side}>
          <mesh ref={(el) => void (wallRefs.current[side + ':tall'] = el)} geometry={tall} material={furnitureMaterial} castShadow receiveShadow />
          <mesh ref={(el) => void (wallRefs.current[side + ':low'] = el)} geometry={low} material={furnitureMaterial} receiveShadow visible={false} />
        </group>
      ))}
      {TORCHES.map(([x, z], i) => (
        <group key={i} ref={(el) => void (torchRefs.current[i] = el)} position={[x, 2.15, z]}>
          {[0, Math.PI / 2].map((r) => (
            <mesh key={r} rotation-y={r} material={flames}>
              <planeGeometry args={[0.28, 0.45]} />
            </mesh>
          ))}
        </group>
      ))}
      <pointLight ref={light} position={[ox + 8, 2.4, oz + 7]} color="#818cf8" intensity={16} distance={24} decay={1} />
      {/* daylight falling through the hole in the ceiling */}
      <mesh position={[HOLE.x, WALL / 2, HOLE.z + 0.2]}>
        <cylinderGeometry args={[0.45, 0.85, WALL, 12, 1, true]} />
        <meshBasicMaterial ref={shaft} color="#e0e7ff" transparent opacity={0.05} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[W / 2, 0.1, H / 2]} position={[ox + W / 2, -0.1, oz + H / 2]} />
        <CuboidCollider args={[W / 2, WALL / 2, 0.5]} position={[ox + W / 2, WALL / 2, oz + 0.5]} />
        <CuboidCollider args={[0.5, WALL / 2, H / 2]} position={[ox + 0.5, WALL / 2, oz + H / 2]} />
        <CuboidCollider args={[W / 2, 1, 0.5]} position={[ox + W / 2, 1, oz + H - 0.5]} />
        <CuboidCollider args={[0.5, 1, H / 2]} position={[ox + W - 0.5, 1, oz + H / 2]} />
      </RigidBody>
    </group>
  );
}

// ── the ladder up ────────────────────────────────────────────────────────────
function Ladder({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const k = new Kit(59);
    const top = WALL + 0.9;
    for (const x of [-0.25, 0.25]) k.box(0.06, top, 0.06, '#8b6b4a', [x, top / 2, 0]);
    for (let y = 0.3; y < top; y += 0.3) k.box(0.5, 0.04, 0.04, '#8b6b4a', [0, y, 0]);
    return k.build()!;
  }, []);
  useFixture(fixture, group, {
    examine: 'A ladder up to Expressive Design. Daylight, and somebody’s cursor.',
    actions: [
      {
        verb: 'Climb-up',
        approach: true,
        run: () => {
          if (!trapdoor.open) gameState().say('You push the trapdoor open from below.');
          trapdoor.open = true;
          sfx('thunk');
          const hatch = getWorld().fixtures.find((f) => f.id === 'trapdoor');
          travel('island', hatch?.approach);
        },
      },
    ],
  });
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh geometry={geometry} material={furnitureMaterial} castShadow />
      {/* the rails are thin: a fatter invisible target for the pointer */}
      <mesh position={[0, (WALL + 0.9) / 2, 0.1]}>
        <boxGeometry args={[0.9, WALL + 0.9, 0.5]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}

// ── the decks ────────────────────────────────────────────────────────────────
function Decks({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const platters = useRef<(THREE.Mesh | null)[]>([]);
  const cones = useRef<(THREE.Mesh | null)[]>([]);
  const lasers = useRef<THREE.Group>(null);
  const laserSweep = useRef(0);
  // the decks are 'playing' whenever the secret track is
  const playing = useGame((s) => s.plugins.sound && !s.musicPaused && TRACKS[s.musicTrack]?.id === SECRET_TRACK);
  const display = useMemo(() => cssFont('--font-geist-sans', 'sans-serif'), []);

  const body = useMemo(() => {
    const k = new Kit(61);
    k.box(1.9, 0.85, 0.8, '#18181b', [0, 0.425, 0]);
    k.box(1.94, 0.05, 0.84, '#27272a', [0, 0.87, 0]);
    for (const x of [-0.55, 0.55]) k.box(0.7, 0.06, 0.6, '#3f3f46', [x, 0.92, 0]);
    k.box(0.32, 0.08, 0.55, '#09090b', [0, 0.93, 0]);
    // speaker stacks
    for (const x of [-1.6, 1.6]) {
      k.box(0.75, 0.8, 0.6, '#0a0a0a', [x, 0.4, 0.05]);
      k.box(0.75, 0.8, 0.6, '#111113', [x, 1.21, 0.05]);
    }
    return k.build()!;
  }, []);

  useEffect(() => {
    party.on = playing;
  }, [playing]);

  useFixture(
    fixture,
    group,
    {
      examine: 'Two decks and a mixer. Someone left a USB stick in it labelled "4AM".',
      actions: [
        {
          verb: playing ? 'Stop' : 'Play',
          approach: true,
          run: () => {
            const g = gameState();
            if (playing) {
              g.say('You pull the fader down. Somebody at the back boos.');
              g.toggleMusicPaused();
            } else {
              if (g.musicPaused) g.toggleMusicPaused();
              playSecretTrack();
              g.say('You drop the needle. The Underpass wakes up.');
              emit({ type: 'shake', amount: 0.3 });
            }
            g.addXp('curiosity', 5);
          },
        },
        {
          verb: 'Dig-crates',
          approach: true,
          run: () =>
            gameState().say(
              ['A white label with "2021" scrawled on it.', 'Twelve copies of the same record. Load-bearing.', 'A flyer for a party that already happened. Twice.'][
                Math.floor(Math.random() * 3)
              ]
            ),
        },
      ],
    },
    [playing]
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const b = beat(t);
    const live = playing || b.live;
    platters.current.forEach((p) => p && (p.rotation.y -= dt * (live ? 3.5 : 0)));
    // woofers (bottom) push on the bass and the kick, tweeters (top) on the highs
    cones.current.forEach((c, i) => c && c.scale.setScalar(1 + (i % 2 ? b.high * 0.1 : b.bass * 0.12 + b.kick * 0.1) * (live ? 1 : 0.3)));
    if (lasers.current) {
      lasers.current.visible = live;
      laserSweep.current += dt * (0.6 + b.high * 2.2);
      lasers.current.children.forEach((l, i) => {
        const s = laserSweep.current;
        l.rotation.y = Math.sin(s * (0.9 + i * 0.2) + i) * 0.7;
        l.rotation.x = -0.05 - Math.abs(Math.sin(s * 0.7 + i)) * 0.12;
        l.scale.set(1 + b.kick * 1.2, 1, 1 + b.kick * 1.2);
      });
    }
    if (live && Math.random() < 0.03 + b.kick * 0.08)
      emit({ type: 'burst', kind: 'steam', x: fixture.x + (Math.random() - 0.5) * 3, y: 0.3, z: fixture.z - 0.8, count: 1 });
  });

  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh geometry={body} material={furnitureMaterial} castShadow receiveShadow />
      {[-0.55, 0.55].map((x, i) => (
        <mesh key={x} ref={(el) => void (platters.current[i] = el)} position={[x, 0.97, 0]}>
          <cylinderGeometry args={[0.26, 0.26, 0.02, 20]} />
          <meshLambertMaterial color={i ? '#4f46e5' : '#09090b'} />
        </mesh>
      ))}
      {[-1.6, 1.6].flatMap((x, s) =>
        [0.42, 1.2].map((y, r) => (
          <mesh key={`${x}${y}`} ref={(el) => void (cones.current[s * 2 + r] = el)} position={[x, y, 0.36]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[r ? 0.2 : 0.28, r ? 0.12 : 0.18, 0.04, 16]} />
            <meshLambertMaterial color="#27272a" />
          </mesh>
        ))
      )}
      <mesh position={[0, 0.95, 0.18]} material={glowMaterial('#a78bfa', 1.4)}>
        <boxGeometry args={[0.24, 0.02, 0.04]} />
      </mesh>
      <Label
        text="RESET"
        height={0.24}
        anchor="center"
        position={[0, 0.5, 0.41]}
        options={{ font: display, weight: '800', size: 110, color: '#fafafa' }}
      />
      <group ref={lasers} position={[0, 1.0, 0.2]} visible={false}>
        {['#a78bfa', '#22d3ee', '#4f46e5', '#f472b6'].map((c) => (
          <group key={c}>
            <mesh position-z={3} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.01, 0.01, 6, 4, 1, true]} />
              <meshBasicMaterial color={c} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ── flyers ───────────────────────────────────────────────────────────────────
const FLYERS: Record<string, { lines: [string, string, string]; accent: string; read: string }> = {
  a: { lines: ['RESET', 'PRESENTS', '2020'], accent: '#6366f1', read: 'RESET Presents. 2020. Doors at ten, ends when it ends.' },
  b: { lines: ['UNDER', 'PASS', '2021'], accent: '#4f46e5', read: 'The Underpass. 2021. Location sent the day of.' },
  c: { lines: ['RESET', 'B2B', '2022'], accent: '#a78bfa', read: 'RESET. 2022. Back to back until the lights come on.' },
};

function Flyer({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const flyer = FLYERS[fixture.label ?? 'a'] ?? FLYERS.a;
  const texture = useMemo(
    () =>
      canvasTexture(256, 360, (g, w, h) => {
        const font = cssFont('--font-geist-sans', 'sans-serif');
        g.fillStyle = '#0b0b0f';
        g.fillRect(0, 0, w, h);
        g.fillStyle = flyer.accent;
        g.fillRect(0, h - 70, w, 70);
        g.fillStyle = '#fafafa';
        g.font = `800 64px ${font}`;
        g.fillText(flyer.lines[0], 18, 82);
        g.font = `800 44px ${font}`;
        g.fillText(flyer.lines[1], 18, 140);
        g.font = `700 40px ${font}`;
        g.fillStyle = '#0b0b0f';
        g.fillText(`${flyer.lines[2]} →`, 18, h - 22);
        g.strokeStyle = flyer.accent;
        g.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.arc(w * 0.62, h * 0.55, 18 + i * 14, 0, Math.PI * 2);
          g.stroke();
        }
      }),
    [flyer]
  );
  useFixture(fixture, group, {
    examine: 'A flyer, pasted to the stone. The glue is still wet.',
    actions: [{ verb: 'Read', approach: true, run: () => gameState().say(flyer.read) }],
  });
  const tilt = ((fixture.id.charCodeAt(fixture.id.length - 1) % 5) - 2) * 0.04;
  useFrame(() => {
    if (group.current) group.current.visible = !wallCut[fixture.yaw === 0 ? 'n' : 'w'];
  });
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh position={[0, 1.55, 0.01]} rotation-z={tilt}>
        <planeGeometry args={[0.7, 0.98]} />
        <meshLambertMaterial map={texture} />
      </mesh>
    </group>
  );
}

export function Basement() {
  const visible = useGame((s) => s.location === 'basement' && s.stage === 'world');
  const B = getBasement();
  return (
    <group visible={visible} name="basement">
      <Room />
      {B.placements.map((p) => (
        <WorkArtboard key={p.work.slug} placement={p} />
      ))}
      {B.fixtures.map((f) => {
        switch (f.kind) {
          case 'monolith':
            return <Monolith key={f.id} fixture={f} />;
          case 'door':
            return <Door key={f.id} fixture={f} />;
          case 'ladder':
            return <Ladder key={f.id} fixture={f} />;
          case 'decks':
            return <Decks key={f.id} fixture={f} />;
          case 'flyer':
            return <Flyer key={f.id} fixture={f} />;
          default:
            return null;
        }
      })}
    </group>
  );
}
