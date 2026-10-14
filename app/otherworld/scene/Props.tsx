'use client';

import type { RefObject } from 'react';
/**
 * Physics toys: hopping design primitives, Text-tool letters, dropped items.
 * All draggable (press + drag to grab, release to throw) and rewindable.
 */
import { useFrame } from '@react-three/fiber';
import { RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tweaks, useTweaks } from '../debug/tweaks';
import { glyphPixels, hasGlyph } from '../lib/pixelFont';
import { mulberry32 } from '../lib/random';
import { pickUp } from '../state/actions';
import { emit, on, sfx } from '../state/events';
import { ITEMS, itemName, type ItemStack } from '../state/items';
import { registerInteractable, runtime, sayOverhead, type Interactable } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { getWorld, heightAt, worldToTile } from '../world/map';
import { revealScale } from './globals';
import { DYNAMIC, KINEMATIC, isRewinding, trackBody } from './Rewind';

function dragFor(body: RefObject<RapierRigidBody | null>): NonNullable<Interactable['drag']> {
  return {
    begin: () => body.current?.setBodyType(KINEMATIC as never, true),
    move: (p) => body.current?.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z }),
    end: (v) => {
      const b = body.current;
      if (!b) return;
      b.setBodyType(DYNAMIC as never, true);
      b.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
      b.setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 }, true);
      if (v.length() > 3) sfx('boing', 1.3);
    },
  };
}

const bodyTile = (body: RefObject<RapierRigidBody | null>) => {
  const p = body.current?.translation();
  return p ? worldToTile(p.x, p.z) : null;
};

// ── the primitives ───────────────────────────────────────────────────────────
interface Species {
  name: string;
  color: string;
  line: string;
  geometry: () => THREE.BufferGeometry;
  eyeZ: number;
  eyeY: number;
}

function starShape(points = 5, outer = 0.36, inner = 0.17) {
  const s = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const fn = i === 0 ? 'moveTo' : 'lineTo';
    s[fn](Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

const SPECIES: Species[] = [
  { name: 'Rectangle', color: '#3b82f6', line: 'It wiggles its corner radius.', geometry: () => new THREE.BoxGeometry(0.62, 0.48, 0.44), eyeZ: 0.225, eyeY: 0.06 },
  { name: 'Ellipse', color: '#f472b6', line: 'It purrs at sixty hertz.', geometry: () => new THREE.SphereGeometry(0.32, 14, 10).scale(1.15, 0.9, 1), eyeZ: 0.3, eyeY: 0.06 },
  { name: 'Polygon', color: '#facc15', line: 'It briefly increases its side count.', geometry: () => new THREE.CylinderGeometry(0.34, 0.34, 0.46, 6), eyeZ: 0.3, eyeY: 0.06 },
  { name: 'Star', color: '#a855f7', line: 'Its points soften.', geometry: () => new THREE.ExtrudeGeometry(starShape(), { depth: 0.24, bevelEnabled: false }).translate(0, 0, -0.12), eyeZ: 0.125, eyeY: 0.02 },
  { name: 'Triangle', color: '#22c55e', line: "It's being obtuse about it.", geometry: () => new THREE.CylinderGeometry(0.4, 0.4, 0.42, 3).rotateY(Math.PI / 6), eyeZ: 0.22, eyeY: 0.04 },
  { name: 'Frame', color: '#fb923c', line: 'It auto-layouts with joy.', geometry: () => new THREE.BoxGeometry(0.56, 0.56, 0.2), eyeZ: 0.105, eyeY: 0.08 },
  { name: 'Vector', color: '#22d3ee', line: "It's pointing at you. Affectionately.", geometry: () => new THREE.ConeGeometry(0.3, 0.6, 4).rotateY(Math.PI / 4), eyeZ: 0.16, eyeY: -0.02 },
];

const HOME = new THREE.Vector3(4.6, 0, 2.4);
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const eyeGeo = new THREE.CircleGeometry(0.06, 10);
const pupilGeo = new THREE.CircleGeometry(0.03, 8);
const eyeMat = new THREE.MeshBasicMaterial({ color: '#fafafa', side: THREE.DoubleSide });
const pupilMat = new THREE.MeshBasicMaterial({ color: '#09090b', side: THREE.DoubleSide });

function Critter({ index }: { index: number }) {
  const species = SPECIES[index % SPECIES.length];
  const id = `critter:${index}`;
  const body = useRef<RapierRigidBody>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => species.geometry(), [species]);
  const material = useMemo(() => new THREE.MeshLambertMaterial({ color: species.color, flatShading: true }), [species]);
  const brain = useRef({ timer: 1 + index * 0.37, grounded: 0, followUntil: 0, rand: mulberry32(index * 97 + 3) });
  const world = getWorld();
  const level = 1 + ((index * 7) % 12);
  const start = useMemo(() => {
    const a = (index / 7) * Math.PI * 2;
    const x = HOME.x + Math.cos(a) * 2.5;
    const z = HOME.z + Math.sin(a) * 2.5;
    return [x, heightAt(world, x, z) + 0.6 + index * 0.15, z] as [number, number, number];
  }, [index, world]);

  useEffect(() => {
    const pet = () => {
      const b = body.current;
      if (!b) return;
      const p = b.translation();
      const d = Math.hypot(p.x - runtime.player.pos.x, p.z - runtime.player.pos.z);
      const g = gameState();
      if (d > 2.6) {
        g.say(`The ${species.name} hops out of reach.`);
        return;
      }
      b.applyImpulse({ x: 0, y: b.mass() * 3.2, z: 0 }, true);
      b.applyTorqueImpulse({ x: 0, y: b.mass() * 0.05, z: 0 }, true);
      emit({ type: 'burst', kind: 'hearts', x: p.x, y: p.y + 0.5, z: p.z, count: 6 });
      g.say(`You pet the ${species.name}. ${species.line}`);
      g.addXp('physics', 6);
      brain.current.followUntil = performance.now() + 12000;
      sfx('pop', 1.4);
    };
    const unregister = registerInteractable({
      id,
      name: species.name,
      tone: 'npc',
      level,
      layer: 'critters',
      object: () => mesh.current,
      examine: `${species.name} ${index + 12}. It escaped from the ruins and now lives on the plaza.`,
      approach: () => bodyTile(body),
      dimensions: () => {
        geometry.computeBoundingBox();
        const s = geometry.boundingBox!.getSize(tmpV);
        return `${Math.round(s.x * 100)} × ${Math.round(s.y * 100)}`;
      },
      actions: [
        { verb: 'Pet', approach: true, run: pet },
        {
          verb: 'Select',
          run: () => {
            gameState().select(id);
            gameState().say(`${species.name} selected. Drag to move, release to throw. ⌘Z to undo.`, 'system');
          },
        },
      ],
      drag: dragFor(body),
    });
    const untrack = body.current ? trackBody(id, body.current) : () => {};
    return () => {
      unregister();
      untrack();
    };
  }, [id, index, level, species, geometry]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const b = body.current;
    if (!b || runtime.draggingId === id || isRewinding() || gameState().stage !== 'world') return;
    const p = b.translation();
    const v = b.linvel();
    const br = brain.current;
    if (p.y < -6) {
      b.setTranslation({ x: start[0], y: start[1] + 3, z: start[2] }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    const ground = heightAt(world, p.x, p.z);
    const grounded = p.y - ground < 0.6 && Math.abs(v.y) < 0.8;
    br.grounded = grounded ? br.grounded + dt : 0;
    br.timer -= dt;
    const hop = tweaks().Physics.hop;
    if (grounded && br.timer < 0 && hop > 0) {
      const follow = performance.now() < br.followUntil;
      const goal = follow
        ? tmpV.copy(runtime.player.pos)
        : tmpV.set(HOME.x + (br.rand() - 0.5) * 8, 0, HOME.z + (br.rand() - 0.5) * 7);
      const dx = goal.x - p.x;
      const dz = goal.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      const stop = follow && len < 1.4;
      const m = b.mass();
      b.applyImpulse({ x: stop ? 0 : (dx / len) * m * 1.5 * hop, y: m * (3.4 + br.rand() * 1.4) * hop, z: stop ? 0 : (dz / len) * m * 1.5 * hop }, true);
      br.timer = 0.9 + br.rand() * 2.2;
      // face where we're hopping
      const yaw = Math.atan2(dx, dz);
      tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      const r = b.rotation();
      tmpQ2.set(r.x, r.y, r.z, r.w).slerp(tmpQ, 0.6);
      b.setRotation(tmpQ2, true);
    }
    // Self-righting once settled: keep the eyes up.
    if (br.grounded > 0.35) {
      const r = b.rotation();
      tmpQ2.set(r.x, r.y, r.z, r.w);
      const fwd = tmpV.set(0, 0, 1).applyQuaternion(tmpQ2);
      tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(fwd.x, fwd.z));
      tmpQ2.slerp(tmpQ, Math.min(1, dt * 6));
      b.setRotation(tmpQ2, true);
    }
    if (mesh.current?.parent) {
      const s = revealScale(p.x, p.z);
      mesh.current.parent.scale.setScalar(Math.max(0.0001, s));
    }
  });

  return (
    <RigidBody
      ref={body}
      colliders="hull"
      position={start}
      restitution={tweaks().Physics.restitution}
      friction={0.9}
      linearDamping={0.15}
      angularDamping={0.6}
      ccd
    >
      <group>
        <mesh ref={mesh} geometry={geometry} material={material} userData={{ interactable: id }} />
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.1, species.eyeY, species.eyeZ + 0.005]}>
            <mesh geometry={eyeGeo} material={eyeMat} />
            <mesh geometry={pupilGeo} material={pupilMat} position={[0, -0.01, 0.004]} />
          </group>
        ))}
      </group>
    </RigidBody>
  );
}

export function Critters() {
  const count = useTweaks((t) => t.Physics.critters);
  const stage = useGame((s) => s.stage);
  if (stage === 'boot' || stage === 'artboard') return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Critter key={i} index={i} />
      ))}
    </>
  );
}

// ── Text tool letters ────────────────────────────────────────────────────────
const PALETTE = ['#3b82f6', '#f472b6', '#facc15', '#22c55e', '#a855f7', '#fb923c', '#22d3ee', '#fafafa'];
const glyphCache = new Map<string, THREE.BufferGeometry>();
const PX = 0.12;
function glyphGeometry(char: string) {
  const key = char.toUpperCase();
  let g = glyphCache.get(key);
  if (!g) {
    const boxes = glyphPixels(key).map(([x, y]) =>
      new THREE.BoxGeometry(PX, PX, 0.2).translate((x - 2) * PX, (y - 3) * PX, 0)
    );
    g = mergeGeometries(boxes, false) ?? new THREE.BoxGeometry(0.5, 0.7, 0.2);
    glyphCache.set(key, g);
  }
  return g;
}
const letterMats = new Map<string, THREE.MeshLambertMaterial>();
const letterMat = (c: string) => {
  let m = letterMats.get(c);
  if (!m) letterMats.set(c, (m = new THREE.MeshLambertMaterial({ color: c, flatShading: true })));
  return m;
};

interface LetterSpec {
  id: string;
  char: string;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
}

function Letter({ spec, onRemove }: { spec: LetterSpec; onRemove: (id: string) => void }) {
  const body = useRef<RapierRigidBody>(null);
  const mesh = useRef<THREE.Mesh>(null);
  useEffect(() => {
    const unregister = registerInteractable({
      id: spec.id,
      name: `“${spec.char.toUpperCase()}”`,
      tone: 'object',
      layer: 'letters',
      object: () => mesh.current,
      examine: `A capital ${spec.char.toUpperCase()}, set in 5×7. Heavier than it looks.`,
      approach: () => bodyTile(body),
      dimensions: () => '5 × 7 px',
      actions: [
        {
          verb: 'Kick',
          approach: true,
          run: () => {
            const b = body.current;
            if (!b) return;
            const p = b.translation();
            const dx = p.x - runtime.player.pos.x;
            const dz = p.z - runtime.player.pos.z;
            const len = Math.hypot(dx, dz) || 1;
            const m = b.mass();
            b.applyImpulse({ x: (dx / len) * m * 6, y: m * 5, z: (dz / len) * m * 6 }, true);
            sfx('boing', 1.2);
            gameState().addXp('physics', 4);
          },
        },
        { verb: 'Delete', run: () => onRemove(spec.id) },
      ],
      drag: dragFor(body),
    });
    const untrack = body.current ? trackBody(spec.id, body.current) : () => {};
    return () => {
      unregister();
      untrack();
    };
  }, [spec, onRemove]);
  return (
    <RigidBody ref={body} colliders="cuboid" position={spec.position} rotation={spec.rotation} restitution={0.2} friction={0.8}>
      <mesh ref={mesh} geometry={glyphGeometry(spec.char)} material={letterMat(spec.color)} userData={{ interactable: spec.id }} />
    </RigidBody>
  );
}

let letterSeq = 0;
export function Letters() {
  const [letters, setLetters] = useState<LetterSpec[]>([]);
  const remove = useMemo(() => (id: string) => setLetters((ls) => ls.filter((l) => l.id !== id)), []);

  useEffect(
    () =>
      on((e) => {
        if (e.type !== 'spawn-letters') return;
        const text = e.text.slice(0, 24);
        const chars = [...text].filter(hasGlyph);
        if (!chars.length) return;
        const g = gameState();
        const yaw = runtime.cam.yaw;
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const toward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const base = runtime.player.pos.clone().addScaledVector(toward, 1.6);
        const width = chars.length * 0.75;
        const color = PALETTE[letterSeq % PALETTE.length];
        const fresh: LetterSpec[] = [];
        chars.forEach((c, i) => {
          if (c === ' ') return;
          const p = base.clone().addScaledVector(right, i * 0.75 - width / 2);
          fresh.push({
            id: `letter:${letterSeq++}`,
            char: c,
            color: i % 3 === 2 ? PALETTE[(letterSeq + 3) % PALETTE.length] : color,
            position: [p.x, p.y + 4 + i * 0.25, p.z],
            rotation: [0, yaw, (Math.random() - 0.5) * 0.3],
          });
        });
        setLetters((ls) => [...ls, ...fresh].slice(-60));
        g.addXp('typography', Math.min(60, fresh.length * 4));
        const word = text.trim().toLowerCase();
        if (word === 'tea') g.say('The letters smell faintly of oolong.');
        if (word === 'mushroom' || word === 'amanita') g.eatMushroom(15);
        if (word === 'hello' || word === 'hi') sayOverhead('Hello to you too.', 3);
        if (word === 'tony' || word === 'toe knee') g.say('Toe Knee looks up, briefly flattered.');
      }),
    []
  );

  return (
    <>
      {letters.map((l) => (
        <Letter key={l.id} spec={l} onRemove={remove} />
      ))}
    </>
  );
}

// ── dropped items ────────────────────────────────────────────────────────────
const spriteCache = new Map<string, THREE.Texture>();
function spriteTexture(stack: ItemStack) {
  const def = ITEMS[stack.id];
  let tex = spriteCache.get(def.id);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, 8, 8);
    def.sprite.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const col = def.palette[ch];
        if (!col) return;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      })
    );
    tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    spriteCache.set(def.id, tex);
  }
  return tex;
}

interface DropSpec {
  id: string;
  item: ItemStack;
  position: [number, number, number];
}

function Drop({ spec, onTake }: { spec: DropSpec; onTake: (id: string) => void }) {
  const body = useRef<RapierRigidBody>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(() => new THREE.MeshLambertMaterial({ map: spriteTexture(spec.item) }), [spec.item]);
  useEffect(() => {
    body.current?.applyImpulse({ x: (Math.random() - 0.5) * 0.05, y: 0.08, z: (Math.random() - 0.5) * 0.05 }, true);
    const unregister = registerInteractable({
      id: spec.id,
      name: itemName(spec.item),
      tone: 'item',
      object: () => mesh.current,
      examine: ITEMS[spec.item.id].examine,
      approach: () => bodyTile(body),
      actions: [
        {
          verb: 'Take',
          approach: true,
          run: () => {
            if (pickUp(spec.item)) onTake(spec.id);
          },
        },
      ],
      drag: dragFor(body),
    });
    const untrack = body.current ? trackBody(spec.id, body.current) : () => {};
    return () => {
      unregister();
      untrack();
    };
  }, [spec, onTake]);
  return (
    <RigidBody ref={body} colliders="cuboid" position={spec.position} restitution={0.35}>
      <mesh ref={mesh} material={material} userData={{ interactable: spec.id }}>
        <boxGeometry args={[0.34, 0.34, 0.34]} />
      </mesh>
    </RigidBody>
  );
}

let dropSeq = 0;
export function Drops() {
  const [drops, setDrops] = useState<DropSpec[]>([]);
  const take = useMemo(() => (id: string) => setDrops((d) => d.filter((x) => x.id !== id)), []);
  useEffect(
    () =>
      on((e) => {
        if (e.type !== 'drop-item') return;
        const p = runtime.player.pos;
        const yaw = runtime.player.yaw;
        setDrops((d) =>
          [
            ...d,
            {
              id: `drop:${dropSeq++}`,
              item: e.item,
              position: [p.x + Math.sin(yaw) * 0.6, p.y + 0.9, p.z + Math.cos(yaw) * 0.6] as [number, number, number],
            },
          ].slice(-24)
        );
      }),
    []
  );
  return (
    <>
      {drops.map((d) => (
        <Drop key={d.id} spec={d} onTake={take} />
      ))}
    </>
  );
}
