'use client';

/**
 * One of Tony's cats (content/cat.ts), loose in the house: the model (../pet/cat), what it gets up to
 * (../pet/brain) and its right-click verbs (../pet/actions). It only exists
 * while you're home; on the island it's hidden and frozen mid-thought.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAT, type CatCoat } from '@/content/cat';
import { tweaks, type Tweaks } from '../debug/tweaks';
import { glowMaterial, houseUniforms } from '../house/materials';
import { damp } from '../lib/random';
import { catApproach, catId, catPlayer, linkCat, petCat, pickUpCat, talkToCat } from '../pet/actions';
import { CatBrain, type CatSettings } from '../pet/brain';
import { CatModel } from '../pet/cat';
import { houseCatWorld } from '../pet/world';
import { npcSay, registerInteractable, runtime } from '../state/runtime';
import { gameState } from '../state/store';
import { onHouseChange } from '../world/places';

const settingsFrom = (t: Tweaks['Cat']): CatSettings => ({
  speed: t.speed,
  wanderiness: t.wanderiness,
  idleMin: t.idleMin,
  idleMax: Math.max(t.idleMin, t.idleMax),
  napChance: t.napChance,
  visitChance: t.visitChance,
  meowChance: t.meowChance,
});

/** A little "z", three glowing bars. */
function zGeometry() {
  const bar = (w: number, h: number, x: number, y: number, rot = 0) => new THREE.BoxGeometry(w, h, 0.012).rotateZ(rot).translate(x, y, 0);
  return mergeGeometries([bar(0.08, 0.016, 0, 0.045), bar(0.1, 0.016, 0, 0, Math.PI / 4.2), bar(0.08, 0.016, 0, -0.045)])!;
}

const tmpHead = new THREE.Vector3();
const tmpLook = new THREE.Vector3();

/** Everything the cat is made of, built once. */
function buildCat(coat: CatCoat) {
  const model = new CatModel(coat);
  const root = new THREE.Group();
  root.name = `pet-${coat.id}`;
  root.userData.interactable = catId(coat);
  root.visible = false;
  root.add(model.group);
  // a generous invisible click box; picking skips the skinned mesh itself
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.72).translate(0, 0.25, 0.02), new THREE.MeshBasicNodeMaterial({ visible: false }));
  hit.name = `pet-${coat.id}-hit`;
  model.group.add(hit);
  model.mesh.raycast = () => undefined;
  // z's, in world space so they always face the camera
  const zs = new THREE.Group();
  zs.visible = false;
  const zGeo = zGeometry();
  for (let i = 0; i < 2; i++) zs.add(new THREE.Mesh(zGeo, glowMaterial(coat.dream)));
  const dispose = () => {
    hit.geometry.dispose();
    (hit.material as THREE.Material).dispose();
    zGeo.dispose();
    model.dispose();
  };
  return { model, root, zs, dispose, speed: 0, anchor: new THREE.Vector3() };
}

export function PetCat({ coat = CAT }: { coat?: CatCoat }) {
  const id = catId(coat);
  const s = useMemo(() => buildCat(coat), [coat]);
  const { model } = s;
  const brain = useMemo(() => new CatBrain(houseCatWorld(coat.basket)), [coat]);
  useEffect(() => s.dispose, [s]);
  /** Above its head, while it's around. */
  const anchor = useMemo(() => () => (s.root.visible ? s.anchor.clone() : null), [s]);

  // the basket and the menu can find it
  useEffect(() => linkCat({ coat, brain, anchor }), [coat, brain, anchor]);

  // furniture built or removed: re-check where it can walk
  useEffect(() => onHouseChange(() => brain.layoutChanged()), [brain]);

  useEffect(
    () =>
      registerInteractable({
        id,
        catchTarget: 'cat',
        name: coat.name,
        tone: 'npc',
        object: () => s.root,
        examine: coat.examine,
        approach: () => catApproach(id),
        actions: [
          { verb: 'Pet', approach: true, run: () => petCat(id) },
          { verb: 'Talk-to', approach: true, run: () => talkToCat(id) },
          { verb: 'Pick-up', approach: true, run: () => pickUpCat(id) },
        ],
        dimensions: () => '1 × 1 tile · 9 lives',
      }),
    [s, id, coat]
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = tweaks().Cat;
    const home = t.enabled && runtime.location === 'house' && gameState().stage === 'world' && houseUniforms.built.value >= 1;
    s.root.visible = home;
    s.zs.visible = false;
    if (!home) return;

    const player = catPlayer();
    if (!brain.present) brain.spawn(player);
    brain.update(dt, settingsFrom(t), player);

    // what it says and does on a whim
    for (const e of brain.events.splice(0)) {
      if (e.type === 'meow') npcSay(id, e.text, anchor, 2.4);
      else if (e.type === 'flick') model.flick();
      else model.twitch();
    }

    s.root.position.set(brain.px, brain.y, brain.pz);
    s.root.rotation.y = brain.yaw;
    model.group.scale.setScalar(t.scale * coat.size);
    s.speed = damp(s.speed, brain.gait, 10, dt);

    let look: { x: number; y: number; z: number } | null = null;
    if (brain.look) {
      tmpLook.set(brain.look.x, 1.5, brain.look.z).sub(s.root.position).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -brain.yaw).divideScalar(t.scale * coat.size);
      look = tmpLook;
    }
    model.update({
      dt,
      time: state.clock.elapsedTime,
      kind: brain.pose,
      t: brain.poseT,
      speed: s.speed,
      phase: brain.phase,
      look,
      stepFps: tweaks().Player.animFps,
    });

    s.root.updateMatrixWorld(true);
    model.headPoint(s.anchor, 0.32);

    // z's drift up off it while it sleeps
    if (brain.asleep) {
      model.headPoint(tmpHead, 0.12);
      s.zs.visible = true;
      const yaw = runtime.cam.yaw;
      s.zs.children.forEach((z, i) => {
        const u = (state.clock.elapsedTime * 0.35 + i * 0.5) % 1;
        // drift up and off to screen-right
        const side = 0.06 + u * 0.12;
        z.position.set(tmpHead.x + Math.cos(yaw) * side, tmpHead.y + u * 0.42, tmpHead.z - Math.sin(yaw) * side);
        z.scale.setScalar((0.55 + u * 0.7) * t.scale * coat.size);
        z.rotation.y = yaw;
        z.visible = u < 0.85;
      });
    }
  });

  return (
    <>
      <primitive object={s.root} />
      <primitive object={s.zs} />
    </>
  );
}
