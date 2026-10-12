'use client';

import type { RefObject } from 'react';
/**
 * Hand-built set pieces: the tea stall, Tony, the signpost, Minky Hut Jr.,
 * RESET's year monoliths and door, the p5 fractal tree and curry pot, the
 * ruins, and the fairy ring.
 */
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { workBySlug } from '@/content/works';
import { zones } from '@/content/zones';
import { canvasTexture } from '../house/furniture/common';
import { arch, portalSurface } from '../house/furniture/garden';
import { Kit } from '../house/kit';
import { furnitureMaterial } from '../house/materials';
import { mulberry32 } from '../lib/random';
import { cssFont } from '../lib/textures';
import { toggleBuildMode, travel } from '../state/actions';
import { emit, on, sfx } from '../state/events';
import { TEAS } from '../state/items';
import { npcSay, registerInteractable, runtime, type InteractAction } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { getWorld, type Fixture } from '../world/map';
import { revealScale } from './globals';
import { Label } from './Label';
import { Revealed } from './Revealed';

function useReveal(fixture: Fixture, ref: RefObject<THREE.Group | null>) {
  const hidden = useGame((s) => !!s.hidden[`fixture:${fixture.id}`]);
  useFrame(() => {
    if (!ref.current) return;
    const s = revealScale(fixture.x, fixture.z);
    ref.current.scale.setScalar(Math.max(0.0001, s));
    ref.current.visible = s > 0.001 && !hidden;
  });
}

function useFixture(
  fixture: Fixture,
  ref: RefObject<THREE.Object3D | null>,
  def: { name?: string; tone?: 'npc' | 'object'; examine: string; actions: InteractAction[]; level?: number; dims?: string },
  deps: unknown[] = []
) {
  useEffect(
    () =>
      registerInteractable({
        id: `fixture:${fixture.id}`,
        name: def.name ?? fixture.name,
        tone: def.tone ?? 'object',
        level: def.level,
        layer: `fixture:${fixture.id}`,
        object: () => ref.current,
        examine: def.examine,
        approach: () => fixture.approach,
        dimensions: def.dims ? () => def.dims! : undefined,
        actions: def.actions,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fixture, ...deps]
  );
}

const lambert = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

// ── Tea stall ────────────────────────────────────────────────────────────────
function TeaStall({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const [stock, setStock] = useState(4);
  const stockRef = useRef(4);
  stockRef.current = stock;
  useReveal(fixture, group);

  useEffect(() => {
    const id = window.setInterval(() => setStock((s) => Math.min(4, s + 1)), 6000);
    return () => window.clearInterval(id);
  }, []);

  const tonyAnchor = () => {
    const tony = getWorld().fixtures.find((f) => f.kind === 'tony');
    return tony ? new THREE.Vector3(tony.x, tony.y + 2.1, tony.z) : null;
  };

  useFixture(fixture, group, {
    examine: 'A stall stocked with loose-leaf. Smells faintly of oolong and good decisions.',
    dims: '1.6 × 0.8 m',
    actions: [
      {
        verb: 'Steal-from',
        approach: true,
        run: () => {
          const g = gameState();
          if (stockRef.current <= 0) {
            g.say('The stall is empty. Tony is brewing more.');
            return;
          }
          g.say('You attempt to steal a cup of tea…');
          window.setTimeout(() => {
            if (Math.random() < 0.15) {
              g.say('You fumble the cup. Tony pretends not to notice.');
              sfx('error');
              return;
            }
            const variant = Math.floor(Math.random() * TEAS.length);
            if (gameState().addItem({ id: 'tea', variant })) {
              setStock((s) => s - 1);
              g.say(`You steal a cup of ${TEAS[variant].name}.`);
              g.addXp('tea', 16);
              if (Math.random() < 0.35) npcSay('tony', 'Oi! …ah, go on then.', tonyAnchor, 3);
            }
          }, 600);
        },
      },
      {
        verb: 'Browse',
        approach: true,
        run: () => {
          const picks = [...TEAS].sort(() => Math.random() - 0.5).slice(0, 4).map((t) => t.name);
          gameState().say(`On the shelf today: ${picks.join(', ')}.`);
          gameState().addXp('tea', 2);
        },
      },
    ],
  });

  useFrame((state) => {
    if (Math.random() < 0.04 && group.current?.visible) {
      const p = new THREE.Vector3(-0.45, 1.12, 0.1).applyMatrix4(group.current.matrixWorld);
      emit({ type: 'burst', kind: 'steam', x: p.x, y: p.y, z: p.z, count: 1 });
    }
    void state;
  });

  const mats = useMemo(
    () => ({
      wood: lambert('#7c5a3c'),
      dark: lambert('#4a3526'),
      blue: lambert('#3b82f6'),
      white: lambert('#f4f4f5'),
      pot: lambert('#e4e4e7'),
      tea: lambert('#7c4a12'),
    }),
    []
  );
  const blackletter = cssFont('--font-blackletter', 'serif');

  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh position={[0, 0.78, 0]} material={mats.wood}>
        <boxGeometry args={[1.7, 0.1, 0.85]} />
      </mesh>
      <mesh position={[0, 0.42, 0.4]} material={mats.dark}>
        <boxGeometry args={[1.7, 0.72, 0.06]} />
      </mesh>
      {[-0.8, 0.8].map((x) =>
        [-0.38, 0.38].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 1.0, z]} material={mats.dark}>
            <boxGeometry args={[0.07, 2.0, 0.07]} />
          </mesh>
        ))
      )}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          position={[-0.78 + i * 0.26, 2.02, 0.05]}
          rotation-x={0.28}
          material={i % 2 ? mats.white : mats.blue}
        >
          <boxGeometry args={[0.26, 0.04, 1.15]} />
        </mesh>
      ))}
      {/* teapot */}
      <group position={[-0.45, 0.95, -0.05]}>
        <mesh material={mats.pot} scale={[1, 0.82, 1]}>
          <sphereGeometry args={[0.16, 10, 8]} />
        </mesh>
        <mesh material={mats.pot} position={[0.18, 0.04, 0]} rotation-z={-0.9}>
          <cylinderGeometry args={[0.025, 0.04, 0.2, 6]} />
        </mesh>
        <mesh material={mats.dark} position={[0, 0.15, 0]}>
          <sphereGeometry args={[0.035, 6, 5]} />
        </mesh>
      </group>
      {/* cups: one per cup in stock */}
      {Array.from({ length: 4 }, (_, i) => (
        <group key={i} position={[-0.05 + i * 0.22, 0.88, 0.12]} visible={i < stock}>
          <mesh material={mats.white}>
            <cylinderGeometry args={[0.065, 0.05, 0.1, 8]} />
          </mesh>
          <mesh material={mats.tea} position-y={0.046} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.055, 8]} />
          </mesh>
        </group>
      ))}
      <Label
        text="Tea"
        height={0.42}
        anchor="center"
        position={[0, 2.42, 0.62]}
        options={{ font: blackletter, color: '#fafafa', size: 120, background: '#18181b', padding: 18, radius: 14 }}
      />
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[0.85, 0.42, 0.42]} position={[0, 0.42, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

// ── Tony ─────────────────────────────────────────────────────────────────────
const TONY_LINES = [
  'Everything here is a shader if you squint.',
  'Have you tried the sheng? It tastes like a forest.',
  'The primitives bite. Gently.',
  'Follow the wires. They know where things are.',
  'Undo works on physics. Try it.',
  'I should really hang the rest of the art.',
];

function Tony({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const nextLine = useRef(8);
  useReveal(fixture, group);

  const anchor = () => (group.current ? new THREE.Vector3(fixture.x, fixture.y + 2.15, fixture.z) : null);

  useFixture(fixture, group, {
    tone: 'npc',
    level: 99,
    examine: 'A design engineer. Builds design tools. Smells faintly of pu-erh.',
    dims: '6′ of design engineer',
    actions: [
      { verb: 'Talk-to', approach: true, run: () => gameState().setDialogue('tony') },
      {
        verb: 'Trade',
        approach: true,
        run: () => npcSay('tony', 'I only trade in tea. Try the stall.', anchor, 3),
      },
    ],
  });

  const mats = useMemo(
    () => ({
      skin: lambert('#efc6a4'),
      sweater: lambert('#ece4d4'),
      jacket: lambert('#c9b38a'),
      jeans: lambert('#2b3448'),
      shoe: lambert('#1c1917'),
      hair: lambert('#a8754a'),
      beanie: lambert('#8a5a32'),
      glass: new THREE.MeshBasicMaterial({ color: '#1c1917' }),
      cap: lambert('#dc2626'),
      stem: lambert('#f3ead8'),
    }),
    []
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (body.current) body.current.position.y = Math.sin(t * 1.8) * 0.012;
    if (head.current && group.current) {
      const p = runtime.player.pos;
      const dx = p.x - fixture.x;
      const dz = p.z - fixture.z;
      const near = dx * dx + dz * dz < 60;
      const target = near ? Math.atan2(dx, dz) - fixture.yaw : Math.sin(t * 0.3) * 0.4;
      const wrapped = Math.atan2(Math.sin(target), Math.cos(target));
      const clampTarget = Math.max(-1.1, Math.min(1.1, wrapped));
      head.current.rotation.y += (clampTarget - head.current.rotation.y) * Math.min(1, dt * 4);
      nextLine.current -= dt;
      if (near && nextLine.current < 0 && gameState().stage === 'world' && !gameState().dialogue) {
        nextLine.current = 18 + Math.random() * 20;
        npcSay('tony', TONY_LINES[Math.floor(Math.random() * TONY_LINES.length)], anchor, 4.5);
      }
    }
  });

  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <group ref={body}>
        {[-0.11, 0.11].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.42, 0]} material={mats.jeans}>
              <boxGeometry args={[0.16, 0.84, 0.18]} />
            </mesh>
            <mesh position={[x, 0.04, 0.05]} material={mats.shoe}>
              <boxGeometry args={[0.17, 0.08, 0.28]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 1.14, 0]} material={mats.sweater}>
          <boxGeometry args={[0.46, 0.62, 0.26]} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[s * 0.19, 1.12, 0.02]} material={mats.jacket}>
              <boxGeometry args={[0.13, 0.7, 0.3]} />
            </mesh>
            <mesh
              position={[s * 0.31, s > 0 ? 1.0 : 1.06, s > 0 ? 0.16 : 0]}
              rotation-x={s > 0 ? -1.0 : 0}
              material={mats.jacket}
            >
              <boxGeometry args={[0.12, 0.56, 0.13]} />
            </mesh>
          </group>
        ))}
        {/* the amanita, held out like in the photo */}
        <group position={[0.31, 0.98, 0.46]}>
          <mesh material={mats.stem} position-y={0.06}>
            <cylinderGeometry args={[0.025, 0.03, 0.14, 6]} />
          </mesh>
          <mesh material={mats.cap} position-y={0.14} scale={[1, 0.7, 1]}>
            <sphereGeometry args={[0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
        </group>
        <group ref={head} position={[0, 1.6, 0]}>
          <mesh material={mats.skin}>
            <boxGeometry args={[0.32, 0.36, 0.3]} />
          </mesh>
          <mesh material={mats.hair} position={[0, -0.12, -0.13]}>
            <boxGeometry args={[0.38, 0.5, 0.12]} />
          </mesh>
          <mesh material={mats.hair} position={[0, 0.02, 0]}>
            <boxGeometry args={[0.36, 0.2, 0.32]} />
          </mesh>
          <mesh material={mats.beanie} position={[0, 0.2, 0]}>
            <boxGeometry args={[0.37, 0.18, 0.34]} />
          </mesh>
          <mesh material={mats.beanie} position={[0, 0.12, 0]}>
            <boxGeometry args={[0.39, 0.06, 0.36]} />
          </mesh>
          {[-0.075, 0.075].map((x) => (
            <mesh key={x} material={mats.glass} position={[x, 0.0, 0.153]}>
              <ringGeometry args={[0.04, 0.055, 12]} />
            </mesh>
          ))}
          <mesh material={mats.glass} position={[0, 0.0, 0.153]}>
            <planeGeometry args={[0.04, 0.012]} />
          </mesh>
        </group>
      </group>
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CylinderCollider args={[0.9, 0.3]} position={[0, 0.9, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

// ── Signpost ─────────────────────────────────────────────────────────────────
function Signpost({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  useReveal(fixture, group);
  const targets = zones.filter((z) => z.id !== 'spawn');
  useFixture(fixture, group, {
    examine: 'A signpost. Each arm is a layer name.',
    actions: [
      {
        verb: 'Read',
        approach: true,
        run: () => {
          const g = gameState();
          for (const z of targets) {
            const d = Math.round(Math.hypot(z.center[0] - fixture.x, z.center[1] - fixture.z));
            g.say(`→ ${z.name} (${d} tiles)`);
          }
          g.addXp('curiosity', 5);
        },
      },
    ],
  });
  const wood = useMemo(() => lambert('#8b6b4a'), []);
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]}>
      <mesh position-y={1.1} material={wood}>
        <boxGeometry args={[0.12, 2.2, 0.12]} />
      </mesh>
      {targets.map((z, i) => {
        const yaw = Math.atan2(z.center[0] - fixture.x, z.center[1] - fixture.z);
        return (
          <group key={z.id} position-y={1.95 - i * 0.3} rotation-y={yaw - Math.PI / 2}>
            <mesh position-x={0.55} material={wood}>
              <boxGeometry args={[1.1, 0.2, 0.05]} />
            </mesh>
            <mesh position-x={1.13} rotation-z={-Math.PI / 2} material={wood}>
              <coneGeometry args={[0.1, 0.12, 3]} />
            </mesh>
            <Label text={z.name} height={0.12} position={[0.08, 0, 0.03]} options={{ color: '#fef3c7', size: 56 }} />
            <Label
              text={z.name}
              height={0.12}
              anchor="right"
              position={[1.05, 0, -0.03]}
              rotation={[0, Math.PI, 0]}
              options={{ color: '#fef3c7', size: 56 }}
            />
          </group>
        );
      })}
    </group>
  );
}

// ── Minky Hut Jr. ────────────────────────────────────────────────────────────
function Hut({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  useReveal(fixture, group);
  const anchor = () => new THREE.Vector3(fixture.x, fixture.y + 1.7, fixture.z);
  useFixture(fixture, group, {
    examine: 'Minky Hut Jr. Smaller than Minky Hut Sr. Nobody has met Minky Hut Sr.',
    actions: [
      {
        verb: 'Knock',
        approach: true,
        run: () => {
          npcSay('hut', 'Knock knock.', () => runtime.player.pos.clone().setY(runtime.player.pos.y + 1.7), 1.6);
          window.setTimeout(() => npcSay('hut-reply', '…beep boop.', anchor, 3, '#93c5fd'), 1500);
          gameState().addXp('curiosity', 4);
        },
      },
      { verb: 'Enter', approach: true, run: () => gameState().say('The door is painted on. Classic Minky.') },
    ],
  });
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh position-y={0.45}>
        <boxGeometry args={[1.1, 0.9, 1]} />
        <meshLambertMaterial color="#d6c3a5" flatShading />
      </mesh>
      <mesh position-y={1.22} rotation-y={Math.PI / 4}>
        <coneGeometry args={[0.92, 0.66, 4]} />
        <meshLambertMaterial color="#9f1239" flatShading />
      </mesh>
      <mesh position={[0, 0.3, 0.505]}>
        <planeGeometry args={[0.3, 0.5]} />
        <meshLambertMaterial color="#3f2a1d" />
      </mesh>
      <mesh position={[0.32, 0.58, 0.505]}>
        <planeGeometry args={[0.2, 0.2]} />
        <meshBasicMaterial color="#fde68a" />
      </mesh>
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[0.55, 0.6, 0.5]} position={[0, 0.6, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

// ── RESET monoliths + door ───────────────────────────────────────────────────
function Monolith({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const strip = useRef<THREE.MeshBasicMaterial>(null);
  const boost = useRef(0);
  useReveal(fixture, group);
  const display = useMemo(() => cssFont('--font-geist-sans', 'sans-serif'), []);
  useEffect(
    () =>
      on((e) => {
        if (e.type === 'sfx' && e.name === 'kick') boost.current = 1;
      }),
    []
  );
  useFixture(fixture, group, {
    examine: `${fixture.label} →. Select a year.`,
    actions: [
      {
        verb: 'Listen',
        approach: true,
        run: () => {
          const g = gameState();
          g.say(g.plugins.sound ? 'You put your ear to the concrete. Four on the floor.' : 'You feel a kick drum through the concrete. (Turn sound on to hear it.)');
          for (let i = 0; i < 16; i++) window.setTimeout(() => sfx('kick'), i * 484);
          g.addXp('curiosity', 4);
        },
      },
      {
        verb: 'Visit',
        run: () => {
          const link = workBySlug.get('reset-presents')?.links?.[0];
          if (link) window.open(link.href, '_blank', 'noopener');
        },
      },
    ],
  });
  useFrame((state, dt) => {
    boost.current = Math.max(0, boost.current - dt * 4);
    const beat = Math.pow(1 - ((state.clock.elapsedTime * 2.066) % 1), 4);
    const p = runtime.player.pos;
    const near = Math.hypot(p.x - fixture.x, p.z - fixture.z) < 12 ? 1 : 0.25;
    if (strip.current) {
      const v = 0.2 + (beat * 0.5 * near + boost.current) * 0.8;
      strip.current.color.setRGB(0.39 * v + 0.05, 0.4 * v + 0.05, 0.95 * v + 0.1, THREE.SRGBColorSpace);
    }
  });
  const is2021 = fixture.label === '2021';
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh position-y={1.25}>
        <boxGeometry args={[0.95, 2.5, 0.3]} />
        <meshLambertMaterial color="#0b0b0f" flatShading />
      </mesh>
      <mesh position={[0, 0.08, 0.16]}>
        <planeGeometry args={[0.95, 0.08]} />
        <meshBasicMaterial ref={strip} color="#6366f1" />
      </mesh>
      <Label
        text={`${fixture.label} →`}
        height={0.3}
        anchor="center"
        position={[0, 1.9, 0.16]}
        options={{ font: display, weight: '800', size: 110, color: is2021 ? '#4f46e5' : '#fafafa' }}
      />
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[0.48, 1.25, 0.15]} position={[0, 1.25, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

function Door({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  useReveal(fixture, group);
  const display = useMemo(() => cssFont('--font-geist-sans', 'sans-serif'), []);
  useFixture(fixture, group, {
    examine: 'A heavy door. Muffled bass behind it.',
    actions: [
      {
        verb: 'Enter',
        approach: true,
        run: () => gameState().say('The Underpass is closed until the next event. Doors open at resetpresents.com.'),
      },
      {
        verb: 'Visit',
        run: () => window.open('https://resetpresents.com', '_blank', 'noopener'),
      },
    ],
  });
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh position-y={1.2}>
        <boxGeometry args={[1.5, 2.4, 0.4]} />
        <meshLambertMaterial color="#3f3f46" flatShading />
      </mesh>
      <mesh position={[0, 0.95, 0.21]}>
        <planeGeometry args={[0.9, 1.9]} />
        <meshLambertMaterial color="#111114" />
      </mesh>
      <Label
        text="RESET"
        height={0.26}
        anchor="center"
        position={[0, 2.2, 0.21]}
        options={{ font: display, weight: '800', size: 110, color: '#fafafa' }}
      />
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[0.75, 1.2, 0.2]} position={[0, 1.2, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

// ── p5 garden: the fractal tree + curry ──────────────────────────────────────
function buildFractal(seed: number) {
  const rand = mulberry32(seed);
  const segs: { a: THREE.Vector3; b: THREE.Vector3; r: number; depth: number }[] = [];
  const grow = (a: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    if (depth > 7 || segs.length > 420) return;
    const b = a.clone().addScaledVector(dir, len);
    segs.push({ a, b, r, depth });
    const kids = depth < 2 ? 2 : rand() < 0.25 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const axis = new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize();
      const nd = dir.clone().applyAxisAngle(axis, 0.35 + rand() * 0.4).normalize();
      nd.applyAxisAngle(new THREE.Vector3(0, 1, 0), (k / kids) * Math.PI * 2 + rand());
      grow(b, nd, len * (0.68 + rand() * 0.1), r * 0.68, depth + 1);
    }
  };
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.9, 0.09, 0);
  return segs;
}

function FractalTree({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const [seed, setSeed] = useState(7);
  const growT = useRef(0);
  useReveal(fixture, group);
  const segs = useMemo(() => buildFractal(seed), [seed]);
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0), []);
  const material = useMemo(() => new THREE.MeshLambertMaterial({ color: '#e5484d', flatShading: true }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useEffect(
    () =>
      on((e) => {
        if (e.type === 'regrow') {
          setSeed((s) => s + 1);
          growT.current = 0;
        }
      }),
    []
  );

  useFixture(
    fixture,
    group,
    {
      examine: "A recursive tree. It's branches all the way down.",
      dims: `${segs.length} branches`,
      actions: [
        {
          verb: 'Water',
          approach: true,
          run: () => {
            emit({ type: 'regrow' });
            gameState().say('You water the fractal tree. It recurses with renewed enthusiasm.');
            gameState().addXp('generative', 20);
            emit({ type: 'burst', kind: 'sparkle', x: fixture.x, y: fixture.y + 1.5, z: fixture.z, count: 24 });
          },
        },
      ],
    },
    [segs.length]
  );

  useFrame((_, dt) => {
    growT.current = Math.min(9, growT.current + dt * 2.2);
    if (!mesh.current) return;
    const dir = new THREE.Vector3();
    segs.forEach((s, i) => {
      const k = Math.max(0, Math.min(1, growT.current - s.depth));
      dir.subVectors(s.b, s.a);
      const len = dir.length() * k;
      dummy.position.copy(s.a);
      dummy.quaternion.setFromUnitVectors(up, dir.normalize());
      dummy.scale.set(s.r * (0.3 + 0.7 * k), Math.max(0.0001, len), s.r * (0.3 + 0.7 * k));
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.count = segs.length;
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]}>
      <instancedMesh ref={mesh} args={[geometry, material, 430]} frustumCulled={false} />
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CylinderCollider args={[0.5, 0.12]} position={[0, 0.5, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

function CurryPot({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const flames = useRef<THREE.Group>(null);
  useReveal(fixture, group);
  useFixture(fixture, group, {
    examine: 'A pot of curry on a small fire. 🍛',
    actions: [
      {
        verb: 'Stir',
        approach: true,
        run: () => {
          gameState().say('You stir the curry. It smells like a Svelte project.');
          gameState().addXp('generative', 5);
          emit({ type: 'burst', kind: 'steam', x: fixture.x, y: fixture.y + 0.8, z: fixture.z, count: 12 });
        },
      },
      {
        verb: 'Taste',
        approach: true,
        run: () => gameState().say('Spicy. Your typography feels… seasoned.'),
      },
    ],
  });
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    flames.current?.children.forEach((c, i) => {
      c.scale.y = 0.8 + Math.sin(t * 12 + i * 2) * 0.25;
    });
    if (Math.random() < 0.05 && group.current?.visible)
      emit({ type: 'burst', kind: 'steam', x: fixture.x, y: fixture.y + 0.75, z: fixture.z, count: 1 });
  });
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]}>
      <mesh position-y={0.45} scale={[1, 0.8, 1]}>
        <sphereGeometry args={[0.42, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshLambertMaterial color="#27272a" side={THREE.DoubleSide} flatShading />
      </mesh>
      <mesh position-y={0.45} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.39, 12]} />
        <meshLambertMaterial color="#d97706" />
      </mesh>
      <mesh position-y={0.46} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.42, 0.03, 4, 16]} />
        <meshLambertMaterial color="#3f3f46" />
      </mesh>
      <group ref={flames} position-y={0.02}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos(i * 2.1) * 0.14, 0.1, Math.sin(i * 2.1) * 0.14]}>
            <coneGeometry args={[0.08, 0.26, 5]} />
            <meshBasicMaterial color={i === 1 ? '#fde047' : '#f97316'} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ── ruins ────────────────────────────────────────────────────────────────────
function FallenFrame({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  useReveal(fixture, group);
  useFixture(fixture, group, {
    examine:
      fixture.id === 'fallen-a'
        ? 'A detached instance. Its main component is long gone.'
        : 'Frame 404. The content could not be found.',
    actions: [
      {
        verb: 'Reattach',
        approach: true,
        run: () => gameState().say('You try to reattach the instance. Main component not found.'),
      },
    ],
  });
  const dark = useMemo(() => lambert('#3f3f46'), []);
  return (
    <group ref={group} position={[fixture.x, fixture.y + 0.25, fixture.z]} rotation={[-1.25, fixture.yaw, 0.15]}>
      <mesh position={[0, 0.9, 0]} material={dark}>
        <boxGeometry args={[2.6, 0.08, 0.08]} />
      </mesh>
      <mesh position={[-1.3, 0, 0]} material={dark}>
        <boxGeometry args={[0.08, 1.8, 0.08]} />
      </mesh>
      <mesh position={[0.4, -0.9, 0]} material={dark} rotation-z={0.12}>
        <boxGeometry args={[1.8, 0.08, 0.08]} />
      </mesh>
      <Label
        text={fixture.id === 'fallen-a' ? '◇ Detached' : 'Frame 404'}
        height={0.2}
        position={[-1.3, 1.08, 0]}
        options={{ color: fixture.id === 'fallen-a' ? '#c084fc' : '#a1a1aa', size: 64 }}
      />
    </group>
  );
}

function DataPoints({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useReveal(fixture, group);
  const points = useMemo(() => {
    const rand = mulberry32(42);
    return Array.from({ length: 28 }, (_, i) => ({
      x: (i / 28) * 2.6 - 1.3 + (rand() - 0.5) * 0.3,
      y: 0.4 + (i / 28) * 1.1 + (rand() - 0.5) * 0.7,
      z: (rand() - 0.5) * 0.8,
      p: rand() * 6,
    }));
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFixture(fixture, group, {
    examine: 'Vague data. Each point is roughly somewhere.',
    actions: [
      {
        verb: 'Analyse',
        approach: true,
        run: () => {
          gameState().say("You analyse the data. It's definitely trending… vaguely upward.");
          gameState().addXp('curiosity', 6);
        },
      },
    ],
  });
  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    points.forEach((p, i) => {
      dummy.position.set(p.x + Math.sin(t * 0.7 + p.p) * 0.08, p.y + Math.sin(t + p.p) * 0.12, p.z);
      dummy.scale.setScalar(0.06 + 0.03 * Math.sin(t * 1.7 + p.p));
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]}>
      <instancedMesh ref={mesh} args={[undefined, undefined, points.length]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#d4d4d8" transparent opacity={0.75} />
      </instancedMesh>
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3, 1.2]} />
        <meshBasicMaterial color="#27272a" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

// ── fairy ring marker ────────────────────────────────────────────────────────
function FairyRing({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  useReveal(fixture, group);
  useFixture(fixture, group, {
    examine: 'A ring of giant amanitas. Standing in the middle is a choice.',
    actions: [
      {
        verb: 'Step-into',
        approach: true,
        run: () => {
          /* the Player handles the effect when it reaches the centre tile */
        },
      },
    ],
  });
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring.current) ring.current.opacity = 0.25 + Math.sin(t * 2) * 0.12;
    if (Math.random() < 0.08 && group.current?.visible) {
      const a = Math.random() * Math.PI * 2;
      emit({ type: 'burst', kind: 'spores', x: fixture.x + Math.cos(a) * 2.6, y: fixture.y + 0.3, z: fixture.z + Math.sin(a) * 2.6, count: 1 });
    }
  });
  return (
    <group ref={group} position={[fixture.x, fixture.y + 0.04, fixture.z]}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.6, 1.05, 32]} />
        <meshBasicMaterial ref={ring} color="#f472b6" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <circleGeometry args={[1.05, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * The way home: a stone arch on the plaza whose opening is the house, seen
 * from a long way off. Enter it and the island fades to the canvas.
 */
function HousePortal({ fixture }: { fixture: Fixture }) {
  const ref = useRef<THREE.Group>(null);
  useReveal(fixture, ref);
  const parts = useMemo(() => {
    const k = new Kit(11);
    k.push([0, 0, 0]);
    arch(k, '#8b8a86', 1.5, 2.1);
    k.box(0.9, 0.2, 0.04, '#3b82f6', [0, 2.95, 0.24], { jitter: 0 });
    k.pop();
    const surface = portalSurface(3, 1.5, 1.35, 0.24, ['#0b1020', '#f59e0b', '#fde68a']);
    return { geometry: k.build()!, surface: surface.object };
  }, []);
  const label = useMemo(
    () =>
      canvasTexture(320, 56, (g, w, h) => {
        g.fillStyle = '#3b82f6';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff';
        g.font = 'bold 30px ui-sans-serif, system-ui, sans-serif';
        g.textBaseline = 'middle';
        g.fillText('Untitled-1 / House', 18, h / 2 + 2);
      }),
    []
  );
  const enter = () => {
    sfx('portal');
    travel('house');
  };
  useFixture(fixture, ref, {
    examine: 'A portal to your house. Every house is in the same place: right through here.',
    actions: [
      { verb: 'Home', run: enter, approach: true },
      {
        verb: 'Build mode',
        approach: true,
        run: () => {
          sfx('portal');
          travel('house', undefined, () => toggleBuildMode(true));
        },
      },
      {
        verb: "Friend's house",
        approach: true,
        run: () => gameState().say("Nobody else has a house here yet. They're probably still in Figma."),
      },
    ],
  });
  return (
    <group ref={ref} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh geometry={parts.geometry} material={furnitureMaterial} castShadow receiveShadow />
      <primitive object={parts.surface} />
      <mesh position={[0, 3.05, 0.265]}>
        <planeGeometry args={[1.1, 0.19]} />
        <meshBasicMaterial map={label} />
      </mesh>
    </group>
  );
}

export function Fixtures() {
  const world = getWorld();
  return (
    <>
      {world.fixtures.map((f) => {
        switch (f.kind) {
          case 'house-portal':
            return <HousePortal key={f.id} fixture={f} />;
          case 'stall':
            return <TeaStall key={f.id} fixture={f} />;
          case 'tony':
            return <Tony key={f.id} fixture={f} />;
          case 'sign':
            return <Signpost key={f.id} fixture={f} />;
          case 'hut':
            return <Hut key={f.id} fixture={f} />;
          case 'monolith':
            return <Monolith key={f.id} fixture={f} />;
          case 'door':
            return <Door key={f.id} fixture={f} />;
          case 'fractal':
            return <FractalTree key={f.id} fixture={f} />;
          case 'pot':
            return <CurryPot key={f.id} fixture={f} />;
          case 'fallen-frame':
            return <FallenFrame key={f.id} fixture={f} />;
          case 'datapoints':
            return <DataPoints key={f.id} fixture={f} />;
          case 'ring':
            return <FairyRing key={f.id} fixture={f} />;
          default:
            return null;
        }
      })}
    </>
  );
}
