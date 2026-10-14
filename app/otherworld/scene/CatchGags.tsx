'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { catchSpeech } from '../state/catch-actions';
import { emit, on, type GameEvent } from '../state/events';
import { ITEMS } from '../state/items';
import { runtime } from '../state/runtime';
import { gameState } from '../state/store';

type Gag = Extract<GameEvent, { type: 'catch-gag' }> & { id: number };
let sequence = 0;

function iconTexture(id: Gag['item']) {
  const def = ITEMS[id];
  const bytes = new Uint8Array(8 * 8 * 4);
  def.sprite.forEach((row, y) => [...row].forEach((pixel, x) => {
    const hex = def.palette[pixel];
    if (!hex) return;
    const value = Number.parseInt(hex.slice(1), 16);
    bytes.set([value >> 16, (value >> 8) & 255, value & 255, 255], ((7 - y) * 8 + x) * 4);
  }));
  const texture = new THREE.DataTexture(bytes, 8, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Each short gag owns its meshes. Nothing mutates the player's or a fixture's materials. */
function CatchGag({ gag, done }: { gag: Gag; done: (id: number) => void }) {
  const elapsed = useRef(0);
  const finished = useRef(false);
  const burst = useRef(false);
  const art = useMemo(() => {
    const group = new THREE.Group();
    const texture = iconTexture(gag.item);
    const iconMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const colors = gag.item === 'old-jpeg' ? ['#fbbf24', '#fb923c', '#6a8db2', '#7c9a4b']
      : gag.item === 'flash-site' ? ['#ec4899', '#22d3ee', '#a3e635', '#fbbf24'] : ['#e879f9', '#7dd3fc', '#fef08a', '#fafafa'];
    const materials = colors.map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    const cube = new THREE.BoxGeometry(1, 1, 1);
    const plane = new THREE.PlaneGeometry(1, 1);
    const torus = new THREE.TorusGeometry(0.75, 0.06, 5, 32);
    const icon = new THREE.Mesh(gag.item === 'missing-texture' ? cube : plane, iconMat);
    icon.scale.setScalar(gag.item === 'missing-texture' ? 0.7 : 0.9);
    group.add(icon);
    const bits = Array.from({ length: 12 }, (_, i) => {
      const bit = new THREE.Mesh(cube, materials[i % materials.length]);
      bit.scale.setScalar(0.10 + (i % 3) * 0.035);
      group.add(bit);
      return bit;
    });
    const rings = Array.from({ length: 3 }, (_, i) => {
      const ring = new THREE.Mesh(torus, materials[i % materials.length]);
      group.add(ring);
      return ring;
    });
    const box = new THREE.Box3();
    return { group, icon, bits, rings, box, materials: [iconMat, ...materials], dispose: () => {
      texture.dispose(); cube.dispose(); plane.dispose(); torus.dispose();
      iconMat.dispose(); materials.forEach((m) => m.dispose());
    } };
  }, [gag.item]);
  useEffect(() => art.dispose, [art]);
  useEffect(() => {
    const speech = catchSpeech(gag.target, gag.label, () => art.group.visible ? art.group.position.clone().add(new THREE.Vector3(0, 1.1, 0)) : null);
    return () => {
      const key = `catch:${gag.target ?? 'player'}`;
      // A newer gag on the same object owns its newer speech.
      if (runtime.overheads.get(key) === speech) runtime.overheads.delete(key);
    };
  }, [gag.target, gag.label, art]);

  useFrame((_, rawDt) => {
    const g = gameState();
    const t = elapsed.current += Math.min(rawDt, 0.1);
    const duration = 6 + gag.variant * 0.6;
    const object = gag.target ? runtime.interactables.get(gag.target)?.object() : null;
    let visible = true;
    for (let parent = object; parent; parent = parent.parent) if (!parent.visible) visible = false;
    if (t >= duration || g.location !== gag.location || g.stage !== 'world' || g.loading || (gag.target && (!object || !visible))) {
      art.group.visible = false;
      if (!finished.current) { finished.current = true; done(gag.id); }
      return;
    }
    art.group.visible = true;
    if (object) {
      art.box.setFromObject(object);
      art.box.getCenter(art.group.position);
      art.group.position.y = Math.min(art.box.max.y + 0.4, art.group.position.y + 1.3);
    } else art.group.position.copy(runtime.player.pos).add(new THREE.Vector3(0, gag.item === 'missing-texture' ? 1.95 : 1.4, 0));
    const fade = Math.min(1, t * 5, (duration - t) * 2);
    art.materials.forEach((m) => { m.opacity = fade; });
    const speed = 1.5 + gag.variant * 0.6;
    if (gag.item === 'missing-texture') {
      art.icon.rotation.set(0.1 * Math.sin(t * speed), t * 0.4, Math.sin(t * 2) * 0.15);
      art.icon.position.set(0, Math.sin(t * speed) * 0.12, 0);
      art.icon.scale.setScalar((gag.target ? 1.2 : 0.7) * (1 + Math.sin(t * 8) * 0.04));
    } else {
      if (runtime.camera) art.icon.quaternion.copy(runtime.camera.quaternion);
      if (gag.item === 'undefined-fish') {
        const a = t * speed;
        const radius = gag.target ? Math.max(0, 1 - t / 2) : 0.9 + gag.variant * 0.15;
        art.icon.position.set(Math.cos(a) * radius, Math.sin(a * 2) * 0.25 + (t > 4 ? (t - 4) * 0.7 : 0), Math.sin(a) * radius);
        art.icon.scale.setScalar(gag.target ? Math.max(0.01, 0.8 - t * 0.4) : 0.65);
      } else {
        art.icon.position.y = Math.sin(t * speed) * 0.15;
        art.icon.rotation.z += Math.sin(t * speed) * (gag.item === 'flash-site' ? 0.2 : 0.08);
      }
    }
    art.bits.forEach((bit, i) => {
      const a = (i / 12) * Math.PI * 2 + t * speed;
      const r = gag.item === 'old-jpeg' ? 0.6 + (i % 4) * 0.22 : 1 + Math.sin(t + i) * 0.18;
      bit.visible = gag.item !== 'undefined-fish';
      bit.position.set(Math.cos(a) * r, Math.sin(t * speed + i * 1.7) * (gag.item === 'old-jpeg' ? 0.8 : 0.35), Math.sin(a) * r);
      bit.rotation.set(t + i, t * speed, i * 0.5);
      if (gag.item === 'flash-site') bit.scale.y = 0.12 + Math.abs(Math.sin(t * 8 + i)) * (gag.target ? 1 : 0.5);
    });
    art.rings.forEach((ring, i) => {
      ring.visible = gag.item === 'broken-link' || gag.item === 'flash-site';
      ring.rotation.set(gag.item === 'flash-site' ? Math.PI / 2 : Math.sin(t + i) * 0.3, t * 0.3 + i, 0);
      ring.scale.setScalar(0.6 + i * 0.35 + Math.sin(t * speed - i) * 0.12);
      ring.position.y = (i - 1) * 0.15;
    });
    if (t > duration - 1 && !burst.current) {
      burst.current = true;
      const p = art.group.position;
      emit({ type: 'burst', kind: gag.item === 'flash-site' ? 'confetti' : gag.item === 'old-jpeg' && gag.target ? 'steam' : 'sparkle', x: p.x, y: p.y, z: p.z, count: 18 });
    }
  });
  return <primitive object={art.group} />;
}

export function CatchGags() {
  const [gags, setGags] = useState<Gag[]>([]);
  useEffect(() => on((event) => {
    if (event.type === 'catch-gag') setGags((active) => [...active.slice(-5), { ...event, id: ++sequence }]);
  }), []);
  const done = useMemo(() => (id: number) => setGags((active) => active.filter((gag) => gag.id !== id)), []);
  return <>{gags.map((gag) => <CatchGag key={gag.id} gag={gag} done={done} />)}</>;
}
