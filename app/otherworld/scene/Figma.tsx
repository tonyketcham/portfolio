'use client';

/**
 * Expressive Design (the Figma zone): the hub every wire on the island runs
 * into, the Motion timeline laid out on the floor, the agent switchboard, a
 * handful of multiplayer cursors, and the trapdoor (left open) down to RESET's
 * basement.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Kit } from '../house/kit';
import { furnitureMaterial, glassMaterial, glowMaterial } from '../house/materials';
import { travel } from '../state/actions';
import { emit, sfx } from '../state/events';
import { npcSay, runtime } from '../state/runtime';
import { gameState } from '../state/store';
import type { Fixture } from '../world/map';
import { lambert, useFixture, useReveal } from './fixtureHooks';
import { beat } from './beat';
import { Label } from './Label';
import { Revealed } from './Revealed';

const FIG = { red: '#f24e1e', coral: '#ff7262', purple: '#a259ff', blue: '#1abcfe', green: '#0acf83', yellow: '#ffc700' };
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const yawQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** Keeps its children turned to the camera (about Y), whatever the parent's rotation. */
function Billboard({ children, position }: { children: ReactNode; position?: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    const g = ref.current;
    if (!g?.parent) return;
    g.getWorldPosition(tmpV);
    yawQ.setFromAxisAngle(UP, Math.atan2(camera.position.x - tmpV.x, camera.position.z - tmpV.z));
    g.parent.getWorldQuaternion(tmpQ);
    g.quaternion.copy(tmpQ.invert().multiply(yawQ));
  });
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  );
}

// ── the hub ──────────────────────────────────────────────────────────────────
/** The five-shape mark, extruded: two columns of rounded pieces and a dot. */
function markGeometry(u: number) {
  const half = (cx: number, cy: number, left: boolean) => {
    const s = new THREE.Shape();
    if (left) {
      s.moveTo(cx, cy + u / 2);
      s.lineTo(cx - u / 2, cy + u / 2);
      s.absarc(cx - u / 2, cy, u / 2, Math.PI / 2, (Math.PI * 3) / 2, false);
      s.lineTo(cx, cy - u / 2);
    } else {
      s.moveTo(cx, cy - u / 2);
      s.lineTo(cx + u / 2, cy - u / 2);
      s.absarc(cx + u / 2, cy, u / 2, -Math.PI / 2, Math.PI / 2, false);
      s.lineTo(cx, cy + u / 2);
    }
    s.closePath();
    return s;
  };
  const dot = new THREE.Shape();
  dot.absarc(u / 2, 0, u / 2, 0, Math.PI * 2, false);
  // the bottom piece: a circle with its top-right quarter squared off
  const tail = new THREE.Shape();
  tail.moveTo(0, -u);
  tail.lineTo(0, -u / 2);
  tail.lineTo(-u / 2, -u / 2);
  tail.absarc(-u / 2, -u, u / 2, Math.PI / 2, Math.PI * 2, false);
  tail.closePath();
  const pieces: [THREE.Shape, string][] = [
    [half(0, u, true), FIG.red],
    [half(0, u, false), FIG.coral],
    [half(0, 0, true), FIG.purple],
    [dot, FIG.blue],
    [tail, FIG.green],
  ];
  return pieces.map(([shape, color]) => {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelSize: 0.014,
      bevelThickness: 0.014,
      bevelSegments: 2,
      curveSegments: 18,
    });
    g.translate(0, 0, -0.05);
    return { geometry: g, material: lambert(color) };
  });
}

export function FigmaHub({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const totem = useRef<THREE.Group>(null);
  const panes = useRef<THREE.Group>(null);
  useReveal(fixture, group);

  const base = useMemo(() => {
    const k = new Kit(23);
    k.cyl(0.78, 0.86, 0.32, '#27272a', [0, 0.16, 0], 16);
    k.cyl(0.6, 0.7, 0.08, '#3f3f46', [0, 0.36, 0], 16);
    // a socket for every wire on the island
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      k.torus(0.05, 0.016, '#fafafa', [Math.cos(a) * 0.84, 0.18, Math.sin(a) * 0.84], 4, 10, Math.PI * 2, {
        rot: [0, Math.PI / 2 - a, 0],
        jitter: 0,
      });
    }
    // the mast the overhead wires hang from
    k.cyl(0.04, 0.05, 2.9, '#18181b', [0, 1.85, 0], 6);
    k.torus(0.2, 0.03, FIG.purple, [0, 3.3, 0], 6, 16, Math.PI * 2, { rot: [Math.PI / 2, 0, 0], jitter: 0 });
    return k.build()!;
  }, []);
  const mark = useMemo(() => markGeometry(0.55), []);
  const pane = useMemo(() => glassMaterial('#c4b5fd', 0.1), []);

  useFixture(fixture, group, {
    examine: 'Expressive Design at Figma. Every wire on the island ends up here eventually.',
    dims: '14 sockets, all taken',
    actions: [
      {
        verb: 'Read',
        approach: true,
        run: () => {
          const g = gameState();
          g.say('Expressive Design, at Figma. Where Tony works now.');
          g.say('Built the timeline in Figma Motion, and the audio that goes on it. Did the UI for Glass.');
          g.say('Laid the AI devex groundwork for the team and the org: skills, agent orchestration, automated review.');
          g.say('The rest of the time: design engineering. Wires in, frames out.');
          g.addXp('tooling', 8);
        },
      },
      {
        verb: 'Tug-wire',
        approach: true,
        run: () => {
          gameState().say('You tug a wire. Somewhere on the island, a frame flickers.');
          emit({ type: 'shake', amount: 0.2 });
          emit({ type: 'burst', kind: 'sparkle', x: fixture.x, y: fixture.y + 3.3, z: fixture.z, count: 18 });
          sfx('pop');
          gameState().addXp('curiosity', 3);
        },
      },
      { verb: 'Visit', run: () => window.open('https://www.figma.com', '_blank', 'noopener') },
    ],
  });

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (totem.current) {
      totem.current.rotation.y = t * 0.5;
      totem.current.scale.setScalar(1 + beat(t).kick * 0.05);
      totem.current.position.y = 1.85 + Math.sin(t * 1.3) * 0.06;
    }
    if (panes.current) panes.current.rotation.y = -t * 0.3;
  });

  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh geometry={base} material={furnitureMaterial} castShadow receiveShadow />
      <group ref={totem}>
        {mark.map((m, i) => (
          <mesh key={i} geometry={m.geometry} material={m.material} castShadow />
        ))}
      </group>
      {/* a few panes of Glass, orbiting */}
      <group ref={panes} position-y={1.85}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          return (
            <mesh key={i} material={pane} position={[Math.cos(a) * 1.25, Math.sin(i * 2) * 0.15, Math.sin(a) * 1.25]} rotation-y={Math.PI / 2 - a}>
              <boxGeometry args={[0.6, 0.95, 0.02]} />
            </mesh>
          );
        })}
      </group>
      <Billboard position={[0, 3.66, 0]}>
        <Label
          text="Expressive Design"
          height={0.22}
          anchor="center"
          options={{ color: '#ffffff', background: FIG.purple, padding: 16, radius: 14, size: 64, weight: '600' }}
        />
      </Billboard>
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CylinderCollider args={[0.2, 0.8]} position={[0, 0.2, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

// ── the timeline, on the floor ───────────────────────────────────────────────
const TL = { length: 5.4, depth: 2.3, loop: 6.5 };
const TRACKS = [-0.62, -0.17, 0.28, 0.76];
const KEYS: [number, number][] = [
  ...[-2.1, -1.2, -0.3, 0.9, 2.0].map((x) => [x, 0] as [number, number]),
  ...[-1.8, -0.5, 0.6, 1.6].map((x) => [x, 1] as [number, number]),
  ...[-2.3, -1.0, 0.2, 1.3, 2.2].map((x) => [x, 2] as [number, number]),
];
const BARS = 46;

export function Timeline({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const keys = useRef<THREE.InstancedMesh>(null);
  const wave = useRef<THREE.InstancedMesh>(null);
  const playing = useRef(true);
  const time = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useReveal(fixture, group);

  const base = useMemo(() => {
    const k = new Kit(7);
    const { length: L, depth: D } = TL;
    k.box(L + 0.1, 0.05, D + 0.1, '#2c2c2c', [0, 0.025, 0], { jitter: 0 });
    k.box(L, 0.02, D, '#1e1e1e', [0, 0.055, 0], { jitter: 0 });
    // ruler
    k.box(L, 0.02, 0.22, '#2c2c2c', [0, 0.07, -D / 2 + 0.13], { jitter: 0 });
    for (let i = 0; i <= 30; i++) {
      const x = -L / 2 + 0.1 + (i / 30) * (L - 0.2);
      k.box(0.014, 0.01, i % 5 ? 0.06 : 0.14, '#8c8c8c', [x, 0.085, -D / 2 + 0.1], { jitter: 0 });
    }
    // lanes and their clips
    const clips: [number, number, string][][] = [
      [[-1.6, 2.2, FIG.purple], [1.2, 2.4, FIG.purple]],
      [[-1.2, 1.6, FIG.blue], [0.9, 1.8, FIG.blue]],
      [[-0.6, 3.8, FIG.green]],
      [[0, 5.0, '#6366f1']],
    ];
    TRACKS.forEach((z, r) => {
      k.box(L - 0.12, 0.012, 0.38, '#262626', [0, 0.068, z], { jitter: 0 });
      for (const [x, len, color] of clips[r]) k.box(len, 0.02, 0.3, color, [x, 0.08, z], { jitter: 0.02 });
    });
    return k.build(false)!;
  }, []);

  useFixture(fixture, group, {
    examine: 'The Motion timeline, laid out on the floor. Tony built this. Mind the playhead.',
    dims: `${TL.loop}s loop · 24 fps`,
    passive: true,
    actions: [
      {
        verb: 'Play/Pause',
        run: () => {
          playing.current = !playing.current;
          gameState().say(playing.current ? 'Playback resumes. The island breathes out.' : 'You pause the timeline. Everything on the island holds its breath.');
          gameState().addXp('tooling', 3);
          sfx('click');
        },
      },
      {
        verb: 'Scrub',
        approach: true,
        run: () => {
          // project the player onto the timeline's length
          const p = runtime.player.pos;
          const dx = p.x - fixture.x;
          const dz = p.z - fixture.z;
          const along = dx * Math.cos(fixture.yaw) - dz * Math.sin(fixture.yaw);
          const u = Math.min(1, Math.max(0, along / TL.length + 0.5));
          time.current = u * TL.loop;
          gameState().say(`You scrub the playhead to ${(u * TL.loop).toFixed(2)}s.`);
          gameState().addXp('tooling', 4);
        },
      },
    ],
  });

  useFrame((state, dt) => {
    if (playing.current) time.current = (time.current + Math.min(dt, 0.05)) % TL.loop;
    const x = -TL.length / 2 + (time.current / TL.loop) * TL.length;
    if (head.current) head.current.position.x = x;
    const b = beat(state.clock.elapsedTime);
    if (keys.current) {
      KEYS.forEach(([kx, row], i) => {
        const since = x - kx;
        const pop = since > 0 && since < 0.45 ? 1 - since / 0.45 : 0;
        dummy.position.set(kx, 0.11 + pop * 0.08, TRACKS[row]);
        dummy.rotation.set(0, Math.PI / 4, 0);
        dummy.scale.setScalar(1 + pop * 0.9);
        dummy.updateMatrix();
        keys.current!.setMatrixAt(i, dummy.matrix);
      });
      keys.current.instanceMatrix.needsUpdate = true;
    }
    if (wave.current) {
      for (let i = 0; i < BARS; i++) {
        const bx = -TL.length / 2 + 0.15 + (i / (BARS - 1)) * (TL.length - 0.3);
        const shape = 0.35 + 0.65 * Math.abs(Math.sin(i * 1.73) * Math.cos(i * 0.41));
        const live = Math.abs(bx - x) < 0.5 ? 1.6 : 1;
        // low bars ride the bass, the middle the mids, the top end the highs
        const band = i < BARS / 3 ? b.bass + b.kick * 0.4 : i < (BARS * 2) / 3 ? b.mid : b.high;
        const h = 0.03 + shape * 0.22 * (0.4 + band * 0.8) * live;
        dummy.position.set(bx, 0.08 + h / 2, TRACKS[3]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        wave.current.setMatrixAt(i, dummy.matrix);
      }
      wave.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh geometry={base} material={furnitureMaterial} receiveShadow />
      <instancedMesh ref={keys} args={[undefined, undefined, KEYS.length]} frustumCulled={false}>
        <boxGeometry args={[0.13, 0.05, 0.13]} />
        <meshLambertMaterial color="#fafafa" />
      </instancedMesh>
      <instancedMesh ref={wave} args={[undefined, undefined, BARS]} frustumCulled={false}>
        <boxGeometry args={[0.07, 1, 0.22]} />
        <meshBasicMaterial color="#a5b4fc" />
      </instancedMesh>
      {/* the playhead */}
      <group ref={head}>
        <mesh position-y={0.7} material={glowMaterial('#0d99ff', 1.2)}>
          <boxGeometry args={[0.035, 1.3, 0.035]} />
        </mesh>
        <mesh position-y={1.38} rotation-x={Math.PI} material={glowMaterial('#0d99ff', 1.2)}>
          <coneGeometry args={[0.1, 0.16, 4]} />
        </mesh>
        <mesh position-y={0.09} material={glowMaterial('#0d99ff', 1)}>
          <boxGeometry args={[0.025, 0.02, TL.depth]} />
        </mesh>
      </group>
    </group>
  );
}

// ── the trapdoor down to RESET ───────────────────────────────────────────────
/** Shared with the ladder below: climbing up pushes it open. */
export const trapdoor = { open: true };

export function Trapdoor({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const shaft = useRef<THREE.MeshBasicMaterial>(null);
  const [open, setOpen] = useState(trapdoor.open);
  useReveal(fixture, group);

  const parts = useMemo(() => {
    const k = new Kit(31);
    // the frame round the hole
    k.box(1.18, 0.1, 0.12, '#5b4636', [0, 0.05, -0.55]);
    k.box(1.18, 0.1, 0.12, '#5b4636', [0, 0.05, 0.55]);
    k.box(0.12, 0.1, 1.0, '#5b4636', [-0.55, 0.05, 0]);
    k.box(0.12, 0.1, 1.0, '#5b4636', [0.55, 0.05, 0]);
    // the top of the ladder, poking out
    for (const x of [-0.24, 0.24]) k.box(0.05, 1.3, 0.05, '#8b6b4a', [x, 0.3, 0.32], { rot: [-0.12, 0, 0] });
    for (const y of [0.15, 0.45, 0.75]) k.box(0.48, 0.035, 0.035, '#8b6b4a', [0, y, 0.32 - y * 0.12]);
    // a little sign
    k.box(0.05, 1.1, 0.05, '#5b4636', [0.85, 0.55, 0.3]);
    const frame = k.build()!;
    const l = new Kit(37);
    for (let i = 0; i < 5; i++) l.box(0.19, 0.06, 1.0, '#7c5a3c', [-0.4 + i * 0.2, 0.03, 0.5]);
    for (const z of [0.2, 0.8]) l.box(1.04, 0.07, 0.07, '#3f3f46', [0, 0.035, z]);
    l.torus(0.07, 0.015, '#a1a1aa', [0, 0.08, 0.85], 4, 10, Math.PI * 2, { rot: [Math.PI / 2, 0, 0] });
    return { frame, lid: l.build(false)! };
  }, []);

  useEffect(() => {
    trapdoor.open = open;
  }, [open]);

  const listen = () => {
    const g = gameState();
    g.say(g.plugins.sound ? 'You lean over the hole. Four on the floor, coming up the ladder.' : 'You feel a kick drum coming up the ladder. (Turn sound on to hear it.)');
    for (let i = 0; i < 16; i++) window.setTimeout(() => sfx('kick'), i * 484);
    g.addXp('curiosity', 4);
  };

  useFixture(
    fixture,
    group,
    {
      examine: open ? 'A trapdoor, propped open. A ladder goes down. The floor is thumping.' : 'A shut trapdoor. The floor is still thumping.',
      actions: [
        {
          verb: 'Climb-down',
          approach: true,
          run: () => {
            if (!trapdoor.open) {
              setOpen(true);
              gameState().say('You heave the trapdoor open.');
            }
            sfx('thunk');
            travel('basement');
          },
        },
        {
          verb: open ? 'Close' : 'Open',
          approach: true,
          run: () => {
            setOpen((o) => !o);
            sfx('thunk');
            gameState().say(open ? 'You let the trapdoor fall shut. The bass is muffled, not gone.' : 'You heave the trapdoor open. Purple light spills out.');
          },
        },
        { verb: 'Listen', approach: true, run: listen },
      ],
    },
    [open]
  );

  const angle = useRef(trapdoor.open ? -1.85 : 0);
  useFrame((state, dt) => {
    if (trapdoor.open !== open) setOpen(trapdoor.open);
    const target = open ? -1.85 : 0;
    angle.current += (target - angle.current) * Math.min(1, dt * 7);
    if (lid.current) lid.current.rotation.x = angle.current;
    const b = beat(state.clock.elapsedTime);
    const pulse = b.kick * 0.7 + b.bass * 0.3;
    const amount = Math.min(1, -angle.current / 1.85);
    if (glow.current) glow.current.color.setRGB((0.06 + pulse * 0.3) * amount, (0.05 + pulse * 0.28) * amount, (0.18 + pulse * 0.8) * amount + 0.01, THREE.SRGBColorSpace);
    if (shaft.current) shaft.current.opacity = (0.04 + pulse * 0.14) * amount;
    if (open && Math.random() < 0.03 && group.current?.visible)
      emit({ type: 'burst', kind: 'steam', x: fixture.x + (Math.random() - 0.5) * 0.6, y: fixture.y + 0.2, z: fixture.z + (Math.random() - 0.5) * 0.6, count: 1 });
  });

  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh geometry={parts.frame} material={furnitureMaterial} castShadow />
      {/* the hole, lit from below */}
      <mesh position-y={0.04} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.98, 0.98]} />
        <meshBasicMaterial ref={glow} color="#000000" />
      </mesh>
      <mesh position-y={1.2}>
        <cylinderGeometry args={[0.62, 0.44, 2.3, 12, 1, true]} />
        <meshBasicMaterial ref={shaft} color="#818cf8" transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      <group ref={lid} position={[0, 0.08, -0.5]}>
        <mesh geometry={parts.lid} material={furnitureMaterial} castShadow />
      </group>
      <Label
        text="B1 ↓ RESET"
        height={0.16}
        anchor="center"
        position={[0.85, 1.02, 0.33]}
        options={{ color: '#fafafa', background: '#4f46e5', padding: 12, radius: 6, size: 56, weight: '700' }}
      />
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[0.6, 0.05, 0.6]} position={[0, 0.05, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

// ── the agent switchboard ────────────────────────────────────────────────────
const LED_COLS = 7;
const LED_ROWS = 9;
const LED_COLORS = [FIG.green, FIG.green, FIG.purple, FIG.yellow, '#1f2937', '#1f2937'].map((c) => new THREE.Color(c));
const AGENTS = [FIG.green, FIG.blue, FIG.purple, FIG.coral];
const DISPATCHES = [
  'Four agents go out. Three come back with a PR. One comes back with a skill.',
  'The orchestrator splits your task into eleven subtasks and a haiku.',
  'An agent returns holding a perfectly scoped diff. You frame it.',
  'The agents agree on a plan. This has never happened before.',
  'An agent writes a skill so other agents can do what it just did.',
];
const REVIEWS = [
  'Automated review: 1 bug, 3 nits, 1 compliment.',
  'Automated review: "Consider extracting this into a skill."',
  'Automated review: LGTM 🚢',
  'Automated review: your shoelaces are untied (nit).',
  'Automated review: this works, but have you considered making it weirder?',
];

export function AgentSwitchboard({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const leds = useRef<THREE.InstancedMesh>(null);
  const bots = useRef<THREE.Group>(null);
  const nextBlink = useRef(0);
  useReveal(fixture, group);

  const rack = useMemo(() => {
    const k = new Kit(41);
    k.box(1.2, 1.9, 0.6, '#18181b', [0, 0.95, 0]);
    k.box(1.06, 1.5, 0.02, '#09090b', [0, 0.95, 0.305], { jitter: 0 });
    k.box(0.86, 0.22, 0.02, '#052e16', [0, 1.78, 0.31], { jitter: 0 });
    for (const x of [-0.5, 0.5]) for (const z of [-0.25, 0.25]) k.box(0.1, 0.06, 0.1, '#3f3f46', [x, 0.03, z]);
    // patch cables spilling out of the jacks and away across the floor
    const colours = [FIG.green, FIG.purple, FIG.blue, FIG.yellow, FIG.coral, FIG.green];
    colours.forEach((c, i) => {
      const x = -0.4 + i * 0.16;
      k.tube(
        [
          [x, 0.5 + (i % 3) * 0.12, 0.33],
          [x * 1.1, 0.25, 0.55],
          [x * 1.6, 0.04, 0.85 + (i % 2) * 0.15],
          [x * 2.4, 0.03, 1.2],
        ],
        0.018,
        c,
        { jitter: 0 }
      );
    });
    return k.build()!;
  }, []);

  const bot = useMemo(() => {
    const k = new Kit(43);
    k.box(0.2, 0.17, 0.18, '#fafafa', [0, 0.11, 0]);
    for (const x of [-0.05, 0.05]) k.box(0.035, 0.035, 0.01, '#09090b', [x, 0.13, 0.092], { jitter: 0 });
    k.cyl(0.006, 0.006, 0.08, '#a1a1aa', [0, 0.23, 0], 4);
    return k.build(false)!;
  }, []);
  const botMats = useMemo(() => AGENTS.map((c) => lambert(c)), []);

  useFixture(fixture, group, {
    examine: "A switchboard of agents. Most of them are reviewing each other's PRs.",
    dims: `${AGENTS.length} agents · ${LED_COLS * LED_ROWS} jobs`,
    actions: [
      {
        verb: 'Dispatch',
        approach: true,
        run: () => {
          gameState().say(pick(DISPATCHES));
          emit({ type: 'burst', kind: 'sparkle', x: fixture.x, y: fixture.y + 2, z: fixture.z, count: 14 });
          gameState().addXp('prompting', 10);
          sfx('pop');
        },
      },
      {
        verb: 'Request-review',
        approach: true,
        run: () => {
          const text = pick(REVIEWS);
          gameState().say(text);
          npcSay('agents', text.replace('Automated review: ', ''), () => new THREE.Vector3(fixture.x, fixture.y + 2.4, fixture.z), 3.5, FIG.green);
          gameState().addXp('prompting', 6);
        },
      },
    ],
  });

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (leds.current && t > nextBlink.current) {
      nextBlink.current = t + 0.12;
      const m = leds.current;
      if (!m.instanceColor) {
        const dummy = new THREE.Object3D();
        for (let i = 0; i < LED_COLS * LED_ROWS; i++) {
          dummy.position.set(-0.42 + (i % LED_COLS) * 0.14, 0.35 + Math.floor(i / LED_COLS) * 0.15, 0.32);
          dummy.updateMatrix();
          m.setMatrixAt(i, dummy.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
      }
      for (let i = 0; i < LED_COLS * LED_ROWS; i++) if (!m.instanceColor || Math.random() < 0.18) m.setColorAt(i, pick(LED_COLORS));
      m.instanceColor!.needsUpdate = true;
    }
    // the agents run laps round the rack, hopping
    bots.current?.children.forEach((b, i) => {
      const a = t * 0.9 + (i / AGENTS.length) * Math.PI * 2;
      b.position.set(Math.cos(a) * 1.15, Math.abs(Math.sin(t * 6 + i * 1.3)) * 0.16, Math.sin(a) * 1.15);
      b.rotation.y = -a;
    });
  });

  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]} rotation-y={fixture.yaw}>
      <mesh geometry={rack} material={furnitureMaterial} castShadow receiveShadow />
      <instancedMesh ref={leds} args={[undefined, undefined, LED_COLS * LED_ROWS]} frustumCulled={false}>
        <boxGeometry args={[0.07, 0.045, 0.02]} />
        <meshBasicMaterial />
      </instancedMesh>
      <Label text="agents: 4 running" height={0.1} anchor="center" position={[0, 1.78, 0.325]} options={{ color: FIG.green, size: 48 }} />
      <group ref={bots}>
        {AGENTS.map((_, i) => (
          <group key={i}>
            <mesh geometry={bot} material={botMats[i]} castShadow />
          </group>
        ))}
      </group>
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[0.6, 0.95, 0.3]} position={[0, 0.95, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

// ── multiplayer cursors ──────────────────────────────────────────────────────
const CURSORS = [
  { name: 'Tony', color: FIG.purple },
  { name: 'agent-1', color: FIG.green },
  { name: 'agent-2', color: FIG.blue },
  { name: 'reviewer', color: FIG.red },
  { name: 'Motion', color: FIG.yellow },
];
const CHATTER = ['ship it', 'can you see my cursor?', 'who detached this', 'lgtm', '⌘Z ⌘Z ⌘Z', 'brb, tea', 'scrub to 0:03', 'is this the final final', 'nice keyframes'];

function cursorGeometry() {
  const s = new THREE.Shape();
  const pts: [number, number][] = [
    [0, 0],
    [0, -0.36],
    [0.09, -0.27],
    [0.155, -0.42],
    [0.21, -0.395],
    [0.145, -0.25],
    [0.26, -0.25],
  ];
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) s.lineTo(...p);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  g.translate(0, 0, -0.015);
  return g;
}

export function Cursors({ fixture }: { fixture: Fixture }) {
  const group = useRef<THREE.Group>(null);
  const items = useRef<(THREE.Group | null)[]>([]);
  const nextChat = useRef(6);
  const { camera } = useThree();
  const geometry = useMemo(cursorGeometry, []);
  const white = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const mats = useMemo(() => CURSORS.map((c) => new THREE.MeshBasicMaterial({ color: c.color })), []);
  useReveal(fixture, group);

  const anchorOf = (i: number) => () => {
    const it = items.current[i];
    return it ? it.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.45, 0)) : null;
  };

  useFixture(fixture, group, {
    tone: 'npc',
    examine: 'Five people are in this file. Three of them are agents.',
    dims: `${CURSORS.length} in the file`,
    actions: [
      {
        verb: 'Wave',
        run: () => {
          CURSORS.forEach((c, i) => window.setTimeout(() => npcSay(`cursor-${i}`, pick(['👋', 'hi!', 'o/', 'hey']), anchorOf(i), 2.5, c.color), i * 220));
          gameState().addXp('curiosity', 2);
        },
      },
      {
        verb: 'Chat',
        run: () => {
          const i = Math.floor(Math.random() * CURSORS.length);
          npcSay(`cursor-${i}`, pick(CHATTER), anchorOf(i), 3, CURSORS[i].color);
        },
      },
    ],
  });

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const p = runtime.player.pos;
    const near = Math.hypot(p.x - fixture.x, p.z - fixture.z) < 9;
    items.current.forEach((it, i) => {
      if (!it) return;
      const ph = i * 1.7;
      let x = Math.sin(t * 0.23 * (1 + i * 0.13) + ph) * 5.2;
      let z = Math.cos(t * 0.19 * (1 + i * 0.11) + ph * 1.3) * 4.2;
      let y = 1.9 + Math.sin(t * 0.7 + ph) * 0.35;
      // Tony's cursor keeps you company while you're here
      if (i === 0 && near) {
        x = p.x - fixture.x + 0.55;
        z = p.z - fixture.z + 0.25;
        y = p.y - fixture.y + 2.35;
      }
      const r = Math.hypot(x, z);
      if (r > 7.5) {
        x *= 7.5 / r;
        z *= 7.5 / r;
      }
      const k = Math.min(1, dt * (i === 0 && near ? 4 : 2));
      it.position.x += (x - it.position.x) * k;
      it.position.y += (y - it.position.y) * k;
      it.position.z += (z - it.position.z) * k;
      it.getWorldPosition(tmpV);
      it.rotation.y = Math.atan2(camera.position.x - tmpV.x, camera.position.z - tmpV.z);
    });
    nextChat.current -= dt;
    if (near && nextChat.current < 0 && gameState().stage === 'world') {
      nextChat.current = 10 + Math.random() * 14;
      const i = 1 + Math.floor(Math.random() * (CURSORS.length - 1));
      npcSay(`cursor-${i}`, pick(CHATTER), anchorOf(i), 3, CURSORS[i].color);
    }
  });

  return (
    <group ref={group} position={[fixture.x, fixture.y, fixture.z]}>
      {CURSORS.map((c, i) => (
        <group key={c.name} ref={(el) => void (items.current[i] = el)} position={[0, 2, 0]}>
          <mesh geometry={geometry} material={white} scale={1.22} position={[-0.025, 0.035, -0.01]} />
          <mesh geometry={geometry} material={mats[i]} />
          <Label
            text={c.name}
            height={0.14}
            position={[0.2, -0.47, 0.01]}
            options={{ color: c.color === FIG.yellow ? '#18181b' : '#ffffff', background: c.color, padding: 12, radius: 10, size: 44, weight: '600' }}
          />
        </group>
      ))}
    </group>
  );
}
