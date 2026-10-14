/** Run with `node scripts/fishing-check.mjs`. Uses the production map and fishing state. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
// Resolve the app's TS/alias imports without bundling or replacing its dependencies.
registerHooks({
  resolve(specifier, context, next) {
    const url = specifier.startsWith('@/') ? new URL(specifier.slice(2), root)
      : specifier.startsWith('.') ? new URL(specifier, context.parentURL) : null;
    if (url) for (const suffix of ['.ts', '.tsx']) {
      const candidate = fileURLToPath(url) + suffix;
      if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.ts') && !url.endsWith('.tsx')) return next(url, context);
    const { outputText } = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  },
});

const saved = new Map();
globalThis.window = { localStorage: {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
  removeItem: (key) => saved.delete(key),
} };

const { FISHING_SPOTS, POND } = await import('../content/fishing.ts');
const { SIZE, T, getWorld, isWalkable, tileCenter, worldToTile } = await import('../app/otherworld/world/map.ts');
const { island } = await import('../app/otherworld/world/places.ts');
const { findPath } = await import('../app/otherworld/world/pathfinding.ts');
const { ITEMS } = await import('../app/otherworld/state/items.ts');
const { CATCH_IDS } = await import('../app/otherworld/state/items.ts');
const { applyItem } = await import('../app/otherworld/state/actions.ts');
const { beginCatchUse, cancelCatchUse, consumeCatch, useCatchOn } = await import('../app/otherworld/state/catch-actions.ts');
const { CATCH_RECIPES } = await import('../content/catch-gags.ts');
const { registerInteractable } = await import('../app/otherworld/state/runtime.ts');
const { on } = await import('../app/otherworld/state/events.ts');
const { linkCat } = await import('../app/otherworld/pet/actions.ts');
const THREE = await import('three');
const { runtime, playPose } = await import('../app/otherworld/state/runtime.ts');
const { fishing, startFishing, stopFishing, tickFishing } = await import('../app/otherworld/state/fishing.ts');
const { useGame, gameState, INVENTORY_SIZE } = await import('../app/otherworld/state/store.ts');
const world = getWorld();

let waterTiles = 0;
for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
  if (world.tiles[j * SIZE + i] !== T.Water) continue;
  waterTiles++;
  assert.equal(isWalkable(world, i, j), false, 'water must block walking');
  const [x, z] = tileCenter(i, j);
  assert.ok(!world.props.trees.some((p) => worldToTile(p.x, p.z).join() === [i, j].join()), `tree in water at ${x},${z}`);
}
assert.ok(waterTiles >= 20, 'a real pond footprint');
assert.ok(!world.edges.some((e) => e.a === 'zone:pond' || e.b === 'zone:pond'), 'pond stays secluded');
for (const position of [POND.rod, POND.entry, ...FISHING_SPOTS.map((s) => s.bank)]) {
  const tile = worldToTile(...position);
  assert.ok(isWalkable(world, ...tile), `dry bank must be standable at ${position}`);
  const path = findPath(island, world.spawn, tile);
  assert.deepEqual(path.at(-1), tile, `reachable from spawn: ${position}`);
}
for (const spot of FISHING_SPOTS) {
  const [i, j] = worldToTile(spot.x, spot.z);
  assert.equal(world.tiles[j * SIZE + i], T.Water, 'bubbles belong on a water tile');
  assert.ok(Math.hypot(spot.x - spot.bank[0], spot.z - spot.bank[1]) <= 1.5, 'fish from the adjacent bank');
  assert.equal(ITEMS[spot.catch].sprite.length, 8, 'catch has an inventory/spot icon');
}

const reset = (rod = true) => {
  stopFishing();
  const inventory = Array(INVENTORY_SIZE).fill(null);
  if (rod) inventory[0] = { id: 'fishing-rod' };
  useGame.setState({ stage: 'world', location: 'island', inventory, chat: [], skills: { ...gameState().skills, fishing: 0 },
    destination: null, loading: null, inspecting: null, dialogue: null });
  runtime.location = 'island';
  runtime.player.pos.set(FISHING_SPOTS[0].bank[0], 0.18, FISHING_SPOTS[0].bank[1]);
};
const waitForCatch = (roll = 0.5) => { for (let i = 0; i < 49; i++) tickFishing(0.1, () => roll); };
reset(false);
startFishing(FISHING_SPOTS[0]);
assert.equal(fishing.session, null, 'no fishing without a rod');
reset();
runtime.player.pos.x = 0;
startFishing(FISHING_SPOTS[0]);
assert.equal(fishing.session, null, 'unreachable approach cannot catch remotely');

for (const spot of FISHING_SPOTS) {
  reset();
  runtime.player.pos.set(...[spot.bank[0], 0.18, spot.bank[1]]);
  startFishing(spot);
  assert.equal(runtime.player.pose.kind, 'fish', 'cast pose holds the rod');
  for (let i = 0; i < 40; i++) tickFishing(0.1, () => 0.5);
  assert.equal(gameState().inventory.filter(Boolean).length, 1, 'catch takes time');
  for (let i = 0; i < 10; i++) tickFishing(0.1, () => 0.5);
  assert.ok(gameState().hasItem(spot.catch), `icon matches the caught item: ${spot.catch}`);
  assert.equal(gameState().skills.fishing, 20, 'XP awarded once for the catch');
  waitForCatch();
  assert.equal(gameState().inventory.filter((i) => i?.id === spot.catch).length, 2, 'continues fishing');
}
for (const [roll, item, xp] of [[0.01, 'flash-site', 80], [0.06, 'undefined-fish', 40]]) {
  reset(); startFishing(FISHING_SPOTS[0]); waitForCatch(roll);
  assert.ok(gameState().hasItem(item), `rare catch: ${item}`);
  assert.equal(gameState().skills.fishing, xp);
}

for (const interrupt of [
  () => gameState().walkTo(world.spawn),
  () => gameState().teleportTo(world.spawn),
  () => gameState().setLocation('house'),
  () => gameState().setStage('artboard'),
  () => gameState().removeSlot(0),
  () => gameState().setDialogue('tony-menu'),
  () => gameState().inspect('modyfi'),
  () => playPose('wave'),
]) {
  reset(); startFishing(FISHING_SPOTS[0]); interrupt(); waitForCatch();
  assert.equal(fishing.session, null, 'interruption cancels the session');
  assert.equal(gameState().skills.fishing, 0, 'no ghost catch after interruption');
}
reset();
useGame.setState({ inventory: Array.from({ length: INVENTORY_SIZE }, (_, i) => ({ id: i ? 'pixel' : 'fishing-rod' })) });
startFishing(FISHING_SPOTS[0]);
assert.equal(fishing.session, null, 'full inventory prevents casting');
reset(); startFishing(FISHING_SPOTS[0]);
useGame.setState({ inventory: Array.from({ length: INVENTORY_SIZE }, (_, i) => ({ id: i ? 'pixel' : 'fishing-rod' })) });
waitForCatch();
assert.equal(fishing.session, null, 'inventory filling during cast stops fishing');
assert.equal(gameState().skills.fishing, 0, 'failed catch earns no XP');
reset();
const inv = Array.from({ length: INVENTORY_SIZE }, (_, i) => i === INVENTORY_SIZE - 1 ? null : ({ id: i ? 'pixel' : 'fishing-rod' }));
useGame.setState({ inventory: inv }); startFishing(FISHING_SPOTS[0]); waitForCatch();
assert.equal(gameState().inventory.at(-1).id, 'missing-texture', 'final free slot accepts catch');
assert.equal(fishing.session, null, 'last free slot filled stops fishing');
assert.equal(runtime.player.pose, null, 'put rod away after inventory fills');
const persisted = JSON.parse(saved.get('untitled-1.save')).state;
assert.ok(persisted.inventory.some((i) => i?.id === 'fishing-rod'), 'rod persists');
assert.ok(persisted.inventory.some((i) => i?.id === 'missing-texture'), 'catch persists');
assert.equal(persisted.skills.fishing, 20, 'earned fishing XP persists');
const progress = saved.get('untitled-1.save');
useGame.setState({ inventory: Array(INVENTORY_SIZE).fill(null), skills: { ...gameState().skills, fishing: 0 } });
saved.set('untitled-1.save', progress);
await useGame.persist.rehydrate();
assert.ok(gameState().hasItem('fishing-rod'), 'rod restored from save');
assert.ok(gameState().hasItem('missing-texture'), 'catch restored from save');
assert.equal(gameState().skills.fishing, 20, 'XP restored from save');
stopFishing();

// Consumable verbs exercise the real inventory router, not a copy of its logic.
const events = [];
const off = on((event) => events.push(event));
function carry(id, quantity) {
  reset(false);
  useGame.setState({ usingCatch: null, inventory: Array.from({ length: INVENTORY_SIZE }, (_, i) => i ? null : { id, ...(quantity ? { quantity } : {}) }) });
}
for (const id of CATCH_IDS) {
  let lastVariant;
  for (let repeat = 0; repeat < 5; repeat++) {
    carry(id);
    const item = gameState().inventory[0];
    applyItem(0, 'Examine');
    assert.equal(gameState().inventory[0], item, 'Examine never consumes a catch');
    applyItem(0, 'Not a verb');
    assert.equal(gameState().inventory[0], item, 'unknown verbs never consume');
    const count = events.filter((e) => e.type === 'catch-gag').length;
    applyItem(0, ITEMS[id].primary);
    assert.equal(gameState().inventory[0], null, `${id} primary action is single-use`);
    assert.equal(events.filter((e) => e.type === 'catch-gag').length, count + 1, 'one visual gag per use');
    const event = events.findLast((e) => e.type === 'catch-gag');
    assert.equal(event.item, id);
    assert.equal(event.target, null);
    if (lastVariant != null) assert.notEqual(event.variant, lastVariant, 'no adjacent repeat');
    lastVariant = event.variant;
    applyItem(0, ITEMS[id].primary);
    assert.equal(events.filter((e) => e.type === 'catch-gag').length, count + 1, 'empty-slot click cannot replay a consumed catch');
  }
}
carry('old-jpeg', 3); applyItem(0, 'Crunch');
assert.equal(gameState().inventory[0].quantity, 2, 'one unit consumed from a stack');

for (const id of CATCH_IDS) {
  carry(id);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const object = new THREE.Mesh(geometry, material);
  object.position.copy(runtime.player.pos);
  const target = { id: `test:${id}`, name: 'Test object', tone: 'object', catchTarget: CATCH_RECIPES[id].target,
    object: () => object, actions: [], examine: '', approach: () => world.spawn };
  const unregister = registerInteractable(target);
  if (id === 'undefined-fish') {
    useGame.setState({ location: 'house' }); runtime.location = 'house';
    object.position.set(0, 0, -160); runtime.player.pos.copy(object.position);
  }
  const unlink = id === 'undefined-fish' ? linkCat({ brain: { present: true, px: object.position.x, pz: object.position.z,
    y: 0, events: [], pet: () => {} }, anchor: () => object.position.clone() }) : () => {};
  beginCatchUse(0);
  const item = gameState().inventory[0];
  target.catchTarget = 'not-supported';
  useCatchOn(target);
  assert.equal(gameState().inventory[0], item, 'wrong object keeps the fish');
  target.catchTarget = CATCH_RECIPES[id].target;
  object.visible = false;
  assert.equal(consumeCatch(0, target), false, 'hidden target cannot consume remotely');
  object.visible = true;
  beginCatchUse(0); useCatchOn(target);
  assert.ok(!gameState().hasItem(id), `${id} object combo consumes`);
  assert.equal(events.findLast((e) => e.type === 'catch-gag').target, target.id, 'effect attaches to the chosen object');
  if (id === 'old-jpeg') assert.ok(gameState().hasItem('tea'), 'JPEG brew creates tea in the freed slot');
  unlink(); unregister(); geometry.dispose(); material.dispose();
}

carry('broken-link');
const object = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
object.position.set(0.5, 0, 0.5);
const target = { id: 'test:portal', name: 'Portal', tone: 'object', catchTarget: 'portal', object: () => object,
  actions: [], examine: '', approach: () => world.spawn };
const unregister = registerInteractable(target);
for (const cancel of [cancelCatchUse, () => gameState().cancelWalk(), () => gameState().setLocation('house'),
  () => gameState().teleportTo(world.spawn), () => gameState().appearAt(world.spawn),
  () => gameState().setLoading('Travelling'), () => gameState().inspect('modyfi'), () => gameState().setDialogue('tony-menu'),
  () => gameState().setStage('artboard'), () => gameState().removeSlot(0)]) {
  carry('broken-link'); beginCatchUse(0); useCatchOn(target);
  const arrive = gameState().destination?.onArrive;
  assert.equal(typeof arrive, 'function', 'distant combo approaches before consuming');
  cancel(); runtime.player.pos.copy(object.position); arrive();
  assert.ok(!events.findLast((e) => e.type === 'catch-gag' && e.target === target.id), 'cancelled arrival has no ghost effect');
}
carry('broken-link'); beginCatchUse(0); useCatchOn(target);
const arrive = gameState().destination.onArrive;
useGame.setState({ inventory: [{ id: 'broken-link' }, ...Array(INVENTORY_SIZE - 1).fill(null)] });
runtime.player.pos.copy(object.position); arrive();
assert.ok(gameState().hasItem('broken-link'), 'a replacement item in the same slot is not consumed');
unregister(); object.geometry.dispose(); object.material.dispose();

carry('missing-texture'); beginCatchUse(0);
const pendingSave = JSON.parse(saved.get('untitled-1.save')).state;
assert.equal(pendingSave.usingCatch, undefined, 'Use-on selection is never persisted');
cancelCatchUse(); applyItem(0, 'Wear');
const consumedSave = saved.get('untitled-1.save');
useGame.setState({ inventory: [{ id: 'missing-texture' }, ...Array(INVENTORY_SIZE - 1).fill(null)] });
saved.set('untitled-1.save', consumedSave); await useGame.persist.rehydrate();
assert.ok(!gameState().hasItem('missing-texture'), 'consumed fish stays consumed after reload');
off();
console.log(`Fishing checks passed: ${waterTiles} blocked water tiles, reachable pond, catches and cancellation, single-use varied gags, all five object combos, cancelled approaches and save persistence.`);
