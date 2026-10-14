'use client';

/**
 * Tony (Main component): the hill at the south of the island. The plinth on
 * the summit is the main component (it opens the README), the pedestals on the
 * middle ledge are its variants, comment pins hold the short opinions, the
 * stones on the low ledge are the timeline, and the mailbox at the foot is how
 * to get in touch. Every one of them opens the book (hud/Book.tsx).
 */
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { profile } from '@/content/profile';
import { roleDates, roleYears, timeline } from '@/content/timeline';
import { cssFont } from '../lib/textures';
import { emit, sfx } from '../state/events';
import { gameState } from '../state/store';
import type { Fixture } from '../world/map';
import { lambert, useFixture, useReveal } from './fixtureHooks';
import { Label } from './Label';
import { Revealed } from './Revealed';

const COMPONENT = '#a855f7'; // design tools' component purple

const chapterOf = (fixture: Fixture) => profile.chapters.find((c) => c.id === fixture.ref);

/** Open the book; the first time, you keep a copy. */
function readAt(key: string) {
  const g = gameState();
  g.openBook(key);
  if (!g.hasItem('journal') && g.addItem({ id: 'journal' }))
    g.say(`You pocket a copy of ${profile.handle}'s README. Read it from your inventory any time.`);
}

/** Thin things are hard to click: an invisible box that still catches the pointer. */
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
function HitBox({ size, y }: { size: [number, number, number]; y: number }) {
  return (
    <mesh position-y={y} material={hitMat}>
      <boxGeometry args={size} />
    </mesh>
  );
}

const stone = lambert('#a8a29e');
const stoneDark = lambert('#78716c');

/** Figma's main-component glyph: four diamonds in a diamond. */
function ComponentGlyph({ size = 0.16, color = COMPONENT, hollow = false }: { size?: number; color?: string; hollow?: boolean }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }), [color]);
  const s = size;
  if (hollow)
    return (
      <mesh material={mat} rotation-z={Math.PI / 4}>
        <ringGeometry args={[s * 0.75, s, 4, 1]} />
      </mesh>
    );
  return (
    <group>
      {[
        [0, s],
        [s, 0],
        [0, -s],
        [-s, 0],
      ].map(([x, y]) => (
        <mesh key={`${x},${y}`} material={mat} position={[x, y, 0]} rotation-z={Math.PI / 4}>
          <planeGeometry args={[s * 0.95, s * 0.95]} />
        </mesh>
      ))}
    </group>
  );
}

// ── the main component ───────────────────────────────────────────────────────
export function Plinth({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const glyph = useRef<THREE.Group>(null);
  useReveal(fixture, group);
  const chapter = chapterOf(fixture);
  useFixture(fixture, group, {
    name: `${profile.handle} (Main component)`,
    examine: 'The main component. Every Toe Knee on this island is an instance of it, including you.',
    dims: '1 instance per visitor',
    actions: [
      { verb: 'Read', approach: true, run: () => readAt(chapter ? `chapter:${chapter.id}` : '') },
      { verb: 'Contact', approach: true, run: () => readAt('contact') },
      {
        verb: 'Take-copy',
        approach: true,
        run: () => {
          const g = gameState();
          if (g.hasItem('journal')) g.say('You already have a copy. It is the same copy. Components are like that.');
          else if (g.addItem({ id: 'journal' })) g.say(`You take a copy of ${profile.handle}'s README.`);
        },
      },
    ],
  });
  const mats = useMemo(() => ({ page: lambert('#efe4c4'), leather: lambert('#7c2d12') }), []);
  useFrame((state) => {
    if (!glyph.current) return;
    const t = state.clock.elapsedTime;
    glyph.current.rotation.y = t * 0.6;
    glyph.current.position.y = 2.15 + Math.sin(t * 1.4) * 0.06;
  });
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh position-y={0.09} material={stoneDark}>
        <boxGeometry args={[1.5, 0.18, 1.5]} />
      </mesh>
      <mesh position-y={0.55} material={stone}>
        <boxGeometry args={[1.05, 0.75, 1.05]} />
      </mesh>
      <mesh position-y={0.98} material={stoneDark}>
        <boxGeometry args={[1.25, 0.12, 1.25]} />
      </mesh>
      {/* the README, open on top */}
      <group position={[0, 1.07, 0.05]} rotation-x={-0.25}>
        <mesh material={mats.leather}>
          <boxGeometry args={[0.78, 0.03, 0.52]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} material={mats.page} position={[s * 0.19, 0.03, 0]} rotation-z={s * -0.08}>
            <boxGeometry args={[0.36, 0.025, 0.48]} />
          </mesh>
        ))}
      </group>
      <group ref={glyph} position-y={2.15}>
        <ComponentGlyph size={0.17} />
        <group rotation-y={Math.PI}>
          <ComponentGlyph size={0.17} />
        </group>
      </group>
      <Label
        text={`❖ ${profile.handle}`}
        height={0.2}
        anchor="center"
        position={[0, 1.65, 0.62]}
        options={{ color: '#fafafa', background: COMPONENT, padding: 14, radius: 10, size: 64 }}
      />
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[0.62, 0.55, 0.62]} position={[0, 0.55, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

// ── variants: a stone statue of you, mid-hobby ───────────────────────────────
function Statue({ prop }: { prop?: 'laptop' | 'teapot' | 'plotter' }) {
  const mats = useMemo(
    () => ({
      body: lambert('#d6d3d1'),
      hair: lambert('#b8b2ac'),
      laptop: lambert('#52525b'),
      screen: new THREE.MeshBasicMaterial({ color: '#60a5fa' }),
      clay: lambert('#b4532a'),
      paper: lambert('#fafaf9'),
      ink: lambert('#dc2626'),
    }),
    []
  );
  const armsForward = prop !== 'plotter';
  return (
    <group>
      {[-0.06, 0.06].map((x) => (
        <mesh key={x} position={[x, 0.21, 0]} material={mats.body}>
          <boxGeometry args={[0.09, 0.42, 0.1]} />
        </mesh>
      ))}
      <mesh position={[0, 0.6, 0]} material={mats.body}>
        <boxGeometry args={[0.26, 0.36, 0.15]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * 0.16, armsForward ? 0.6 : 0.56, armsForward ? 0.08 : 0]}
          rotation-x={armsForward ? -1.1 : s > 0 ? -0.5 : 0}
          material={mats.body}
        >
          <boxGeometry args={[0.07, 0.3, 0.08]} />
        </mesh>
      ))}
      <mesh position={[0, 0.9, 0]} material={mats.body}>
        <boxGeometry args={[0.18, 0.2, 0.17]} />
      </mesh>
      <mesh position={[0, 0.84, -0.07]} material={mats.hair}>
        <boxGeometry args={[0.22, 0.3, 0.07]} />
      </mesh>
      <mesh position={[0, 0.97, 0]} material={mats.hair}>
        <boxGeometry args={[0.2, 0.08, 0.19]} />
      </mesh>
      {prop === 'laptop' && (
        <group position={[0, 0.66, 0.22]}>
          <mesh material={mats.laptop}>
            <boxGeometry args={[0.24, 0.015, 0.16]} />
          </mesh>
          <mesh material={mats.laptop} position={[0, 0.08, -0.08]} rotation-x={-0.25}>
            <boxGeometry args={[0.24, 0.16, 0.012]} />
          </mesh>
          <mesh material={mats.screen} position={[0, 0.08, -0.072]} rotation-x={-0.25}>
            <planeGeometry args={[0.21, 0.13]} />
          </mesh>
        </group>
      )}
      {prop === 'teapot' && (
        <group position={[0.02, 0.7, 0.22]}>
          <mesh material={mats.clay} scale={[1.2, 0.8, 1]}>
            <sphereGeometry args={[0.07, 10, 8]} />
          </mesh>
          <mesh material={mats.clay} position={[0.09, 0.01, 0]} rotation-z={-1}>
            <cylinderGeometry args={[0.012, 0.02, 0.09, 6]} />
          </mesh>
          <mesh material={mats.clay} position-y={0.06}>
            <sphereGeometry args={[0.02, 6, 5]} />
          </mesh>
        </group>
      )}
      {prop === 'plotter' && (
        <group position={[0.3, 0, 0.12]}>
          <mesh material={mats.laptop} position-y={0.45}>
            <boxGeometry args={[0.36, 0.04, 0.28]} />
          </mesh>
          <mesh material={mats.paper} position-y={0.475}>
            <boxGeometry args={[0.3, 0.008, 0.22]} />
          </mesh>
          {/* a recursive tree, mid-plot */}
          {[0, 0.5, -0.5].map((r, i) => (
            <mesh key={i} material={mats.ink} position={[i ? r * 0.08 : 0, 0.481, i ? -0.04 : 0.02]} rotation={[-Math.PI / 2, 0, r]}>
              <planeGeometry args={[0.01, i ? 0.08 : 0.1]} />
            </mesh>
          ))}
          {[-0.15, 0.15].map((x) => (
            <mesh key={x} material={mats.laptop} position={[x, 0.22, 0]}>
              <boxGeometry args={[0.03, 0.44, 0.03]} />
            </mesh>
          ))}
          <mesh material={mats.laptop} position={[0, 0.55, 0]}>
            <boxGeometry args={[0.36, 0.03, 0.03]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function Pedestal({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  useReveal(fixture, group);
  const chapter = chapterOf(fixture);
  const examines: Record<string, string> = {
    laptop: 'A variant. It has strong opinions about your component library.',
    teapot: 'A variant. Steeped, not stirred.',
    plotter: 'A variant. It draws a tree that draws a tree that draws a tree.',
  };
  useFixture(fixture, group, {
    name: `${fixture.name} (Variant)`,
    examine: examines[chapter?.prop ?? ''] ?? 'A variant of the main component.',
    actions: [{ verb: 'Read', approach: true, run: () => readAt(`chapter:${fixture.ref}`) }],
  });
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh position-y={0.06} material={stoneDark}>
        <boxGeometry args={[0.8, 0.12, 0.8]} />
      </mesh>
      <mesh position-y={0.5} material={stone}>
        <boxGeometry args={[0.6, 0.8, 0.6]} />
      </mesh>
      <group position-y={0.9}>
        <Statue prop={chapter?.prop} />
      </group>
      <group position={[-0.22, 0.62, 0.305]}>
        <ComponentGlyph size={0.05} hollow />
      </group>
      <Label text={fixture.name} height={0.13} anchor="center" position={[0, 0.5, 0.305]} options={{ color: '#3f3f46', size: 56 }} />
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[0.32, 0.5, 0.32]} position={[0, 0.5, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

// ── comment pins ─────────────────────────────────────────────────────────────
export function CommentPin({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const bubble = useRef<THREE.Group>(null);
  useReveal(fixture, group);
  const chapter = chapterOf(fixture);
  useFixture(fixture, group, {
    name: `Comment: ${fixture.name}`,
    examine: chapter?.body[0] ?? 'A comment, pinned to the turf.',
    actions: [
      { verb: 'Read', approach: true, run: () => readAt(`chapter:${fixture.ref}`) },
      { verb: 'Resolve', run: () => gameState().say('You try to resolve the comment. Toe Knee reopens it.') },
    ],
  });
  const seed = (fixture.x * 7.3 + fixture.z * 3.1) % 6;
  useFrame((state) => {
    if (!bubble.current) return;
    bubble.current.position.y = 1.15 + Math.sin(state.clock.elapsedTime * 1.6 + seed) * 0.04;
  });
  const mats = useMemo(() => ({ pin: lambert('#facc15'), stick: lambert('#71717a') }), []);
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh position-y={0.45} material={mats.stick}>
        <cylinderGeometry args={[0.015, 0.015, 0.9, 5]} />
      </mesh>
      <HitBox size={[0.5, 1.4, 0.5]} y={0.7} />
      <group ref={bubble} position-y={1.15}>
        {/* a speech-bubble pin: round, with one sharp corner pointing at the spot */}
        <mesh material={mats.pin} scale={[1, 1, 0.35]}>
          <sphereGeometry args={[0.2, 14, 10]} />
        </mesh>
        <mesh material={mats.pin} position={[-0.12, -0.12, 0]} rotation-z={Math.PI / 4}>
          <boxGeometry args={[0.16, 0.16, 0.12]} />
        </mesh>
        <Label text="TK" height={0.12} anchor="center" position={[0, 0, 0.075]} options={{ color: '#422006', size: 64, weight: '700' }} />
      </group>
      <Label text={fixture.name} height={0.11} anchor="center" position={[0, 1.48, 0]} options={{ color: '#fef9c3', background: '#27272a', padding: 10, radius: 8, size: 52 }} />
    </group>
  );
}

// ── the timeline ─────────────────────────────────────────────────────────────
export function Stone({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const strip = useRef<THREE.MeshBasicMaterial>(null);
  useReveal(fixture, group);
  const role = timeline.find((r) => r.id === fixture.ref);
  const display = useMemo(() => cssFont('--font-geist-sans', 'sans-serif'), []);
  useFixture(fixture, group, {
    examine: role ? `${role.role}, ${role.org}. ${roleDates(role)}.` : 'A standing stone.',
    examineXp: { skill: 'curiosity', amount: 3 },
    dims: role ? roleDates(role) : undefined,
    actions: [{ verb: 'Read', approach: true, run: () => readAt(`role:${fixture.ref}`) }],
  });
  useFrame((state) => {
    if (!strip.current) return;
    const v = 0.65 + Math.sin(state.clock.elapsedTime * 2 + fixture.x) * 0.25;
    strip.current.color.setRGB(0.96 * v, 0.62 * v, 0.04 * v, THREE.SRGBColorSpace);
  });
  if (!role) return null;
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh position={[0, 0.58, 0]} rotation-z={0.04} material={stoneDark}>
        <boxGeometry args={[0.72, 1.16, 0.24]} />
      </mesh>
      <mesh position={[0, 0.07, 0.125]}>
        <planeGeometry args={[0.72, 0.06]} />
        <meshBasicMaterial ref={strip} color="#f59e0b" />
      </mesh>
      <Label
        text={roleYears(role)}
        height={0.2}
        anchor="center"
        position={[0, 0.86, 0.125]}
        options={{ font: display, weight: '800', size: 96, color: '#fafaf9' }}
      />
      <Label text={role.org} height={0.1} anchor="center" position={[0, 0.6, 0.125]} options={{ color: '#e7e5e4', size: 56 }} />
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[0.36, 0.58, 0.12]} position={[0, 0.58, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

// ── the view ─────────────────────────────────────────────────────────────────
export function Telescope({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  useReveal(fixture, group);
  useFixture(fixture, group, {
    examine: 'Brass, on a tripod. Pointed at everything at once.',
    actions: [
      {
        verb: 'Look-out',
        approach: true,
        run: () => {
          // frame the whole island from behind the hill: zoom to fit
          emit({ type: 'focus-camera', x: 0, y: 1, z: 1.5, distance: 42, yaw: 0, pitch: 0.46 });
          sfx('unfold');
          gameState().say('Zoom to fit. Every frame on the island, wired together. (Click anywhere to look away.)');
          gameState().addXp('wandering', 25);
        },
      },
    ],
  });
  const mats = useMemo(() => ({ brass: lambert('#c08a2e'), wood: lambert('#5b3a1e'), glass: new THREE.MeshBasicMaterial({ color: '#93c5fd' }) }), []);
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2;
        return (
          <mesh key={k} material={mats.wood} position={[Math.sin(a) * 0.16, 0.5, Math.cos(a) * 0.16]} rotation={[Math.cos(a) * 0.32, 0, -Math.sin(a) * 0.32]}>
            <cylinderGeometry args={[0.02, 0.02, 1.02, 5]} />
          </mesh>
        );
      })}
      <HitBox size={[0.6, 1.3, 0.8]} y={0.65} />
      <group position-y={1.05} rotation-x={Math.PI / 2 - 0.18}>
        <mesh material={mats.brass}>
          <cylinderGeometry args={[0.06, 0.085, 0.75, 10]} />
        </mesh>
        <mesh material={mats.glass} position-y={-0.38} rotation-x={Math.PI / 2}>
          <circleGeometry args={[0.08, 10]} />
        </mesh>
      </group>
    </group>
  );
}

// ── getting in touch ─────────────────────────────────────────────────────────
export function Mailbox({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const flag = useRef<THREE.Group>(null);
  const raised = useRef(0);
  useReveal(fixture, group);
  useFixture(fixture, group, {
    examine: `${profile.handle}'s mailbox. It accepts letters, links and the occasional tea leaf.`,
    actions: [
      { verb: 'Open', approach: true, run: () => readAt('contact') },
      ...profile.links.map((l) => ({
        verb: `Post-to ${l.label}`,
        run: () => {
          // straight away, so the browser still counts it as your click
          window.open(l.href, '_blank', 'noopener');
          raised.current = 1;
          sfx('pop');
          gameState().say(l.note ?? `You post a letter to ${l.label}.`);
        },
      })),
    ],
  });
  useFrame((_, dt) => {
    raised.current = Math.max(0, raised.current - dt * 0.15);
    if (flag.current) flag.current.rotation.z = THREE.MathUtils.lerp(flag.current.rotation.z, raised.current > 0 ? -Math.PI / 2 : 0, Math.min(1, dt * 6));
  });
  const mats = useMemo(() => ({ post: lambert('#5b3a1e'), box: lambert('#b91c1c'), flag: lambert('#facc15'), slot: lambert('#1c1917') }), []);
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh position-y={0.5} material={mats.post}>
        <boxGeometry args={[0.09, 1.0, 0.09]} />
      </mesh>
      <HitBox size={[0.5, 1.4, 0.6]} y={0.7} />
      <mesh position-y={1.12} material={mats.box}>
        <boxGeometry args={[0.36, 0.26, 0.52]} />
      </mesh>
      <mesh position-y={1.25} rotation-x={Math.PI / 2} material={mats.box}>
        <cylinderGeometry args={[0.18, 0.18, 0.52, 10, 1, false, Math.PI / 2, Math.PI]} />
      </mesh>
      <mesh position={[0, 1.18, 0.262]} material={mats.slot}>
        <boxGeometry args={[0.2, 0.03, 0.01]} />
      </mesh>
      <group ref={flag} position={[0.19, 1.08, -0.1]}>
        <mesh material={mats.flag} position-y={0.14}>
          <boxGeometry args={[0.02, 0.28, 0.03]} />
        </mesh>
        <mesh material={mats.flag} position={[0, 0.25, 0.06]}>
          <boxGeometry args={[0.02, 0.08, 0.1]} />
        </mesh>
      </group>
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[0.2, 0.7, 0.28]} position={[0, 0.7, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}
