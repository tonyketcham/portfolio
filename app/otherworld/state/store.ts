'use client';

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { SkillId } from '@/content/works';
import type { TilePos } from '../world/pathfinding';
import { rebuildHouse, type HouseEdits, type PlaceId } from '../world/places';
import type { HouseStyleId } from '../house/types';
import { TRACKS, musicArea, nextTrack, trackLocked, type MusicMode, type TrackUnlocks } from '../audio/tracks';
import { MAX_CREATURES, sanitizeSpec, type CreatureSpec } from '../creatures/spec';
import { EFFECT_PRESETS, reconcileStack, type EffectId, type EffectLayer } from './effects';
import { sfx } from './events';
import { ITEMS, withStarterKit, type ItemStack } from './items';
import { prayerById, type PrayerId } from './prayers';
import { SKILLS, XP_TABLE, levelForXp, skillById } from './skills';

/** localStorage that never throws (private windows, blocked storage, previews). */
const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export type Stage = 'boot' | 'artboard' | 'unfolding' | 'world';
export type Tab = 'inventory' | 'skills' | 'quests' | 'layers' | 'effects' | 'lab' | 'prayer' | 'house' | 'music' | 'plugins';
export type Tool = 'move' | 'text';
export type Tone = 'npc' | 'object' | 'item' | 'work' | 'player' | 'plain' | 'zone';

export interface MenuOption {
  verb: string;
  target?: string;
  tone?: Tone;
  run: () => void;
}

export interface MenuState {
  x: number;
  y: number;
  options: MenuOption[];
}

export interface ChatLine {
  id: number;
  kind: 'game' | 'npc' | 'public' | 'system' | 'fx';
  from?: string;
  text: string;
}

export interface XpDrop {
  id: number;
  skill: SkillId;
  amount: number;
}

export interface Destination {
  seq: number;
  tile: TilePos;
  onArrive?: () => void;
  /** Teleports skip walking entirely. */
  teleport?: boolean;
  /** Appear there this frame (portal arrivals), no cut / paste. */
  instant?: boolean;
}

export interface Plugins {
  tileMarkers: boolean;
  destinationTile: boolean;
  boundingBoxes: boolean;
  mouseover: boolean;
  xpDrops: boolean;
  fps: boolean;
  localSky: boolean;
  sound: boolean;
  minimap: boolean;
}

export const PLUGIN_INFO: Record<keyof Plugins, { name: string; blurb: string }> = {
  tileMarkers: { name: 'Ground markers', blurb: 'Long-press a tile → Mark tile.' },
  destinationTile: { name: 'Tile indicators', blurb: 'Outline the tile you are walking to.' },
  boundingBoxes: { name: 'Bounding boxes', blurb: 'Design-tool selection boxes on hover.' },
  mouseover: { name: 'Mouseover text', blurb: 'Top-left action hint on desktop.' },
  xpDrops: { name: 'XP drops', blurb: 'Floating xp numbers.' },
  fps: { name: 'FPS', blurb: 'Frames per second, top left.' },
  localSky: { name: 'Local sky', blurb: 'The sky follows your local time.' },
  sound: { name: 'Sound', blurb: 'Synthesised blips and music. No samples.' },
  minimap: { name: 'Minimap', blurb: 'The navigator in the corner.' },
};

interface GameState {
  stage: Stage;
  introSeen: boolean;
  tab: Tab | null;
  tool: Tool;
  menu: MenuState | null;
  inspecting: string | null;
  dialogue: string | null;
  textPrompt: boolean;
  chat: ChatLine[];
  chatOpen: boolean;
  xpDrops: XpDrop[];
  skills: Record<SkillId, number>;
  levelUp: { skill: SkillId; level: number; seq: number } | null;
  inventory: (ItemStack | null)[];
  /** A session-only Use-on selection; the stack reference protects delayed arrivals. */
  usingCatch: { slot: number; stack: ItemStack } | null;
  quests: Record<string, 'seen' | 'done'>;
  effects: EffectLayer[];
  /** Gradient-map palette set by the last preset (overrides the tweak default). */
  palette: [string, string, string] | null;
  plugins: Plugins;
  hidden: Record<string, true>;
  locked: Record<string, true>;
  markers: Record<string, true>;
  destination: Destination | null;
  running: boolean;
  caffeine: number;
  mushroomUntil: number;
  dialOpen: boolean;
  selected: string | null;
  zoneId: string | null;
  /** Where the player is: the house, or the island outside it. */
  location: PlaceId;
  /** The island unfolds the first time you walk out onto it. */
  islandVisited: boolean;
  buildMode: boolean;
  /** Visitor furniture changes, by hotspot key. */
  houseEdits: HouseEdits;
  houseStyle: HouseStyleId | null;
  /** Open furniture creation menu (hotspot key). */
  building: string | null;
  loading: string | null;
  /** Active overhead prayer, floating above the player's head. */
  prayer: PrayerId | null;
  /** 0 … 1. Zero is off, like the game's slider. */
  musicVolume: number;
  musicMode: MusicMode;
  /** The track playing (or about to). */
  musicTrack: number;
  /** Bumped when the visitor picks a track, so the player restarts even on the same one. */
  musicSeq: number;
  musicPaused: boolean;
  /** Tracks heard at least once, by id: green in the Music tab. */
  musicHeard: Record<string, true>;
  /** Secret tracks found, by id. Until then they're hidden and unplayable. */
  musicSecrets: TrackUnlocks;
  /** Visitor-made creatures living in the world. */
  creatures: CreatureSpec[];
  /** The creature on the lab's workbench; not in the world until it's spawned. */
  labDraft: CreatureSpec | null;

  setStage: (stage: Stage) => void;
  setTab: (tab: Tab | null) => void;
  setTool: (tool: Tool) => void;
  openMenu: (menu: MenuState) => void;
  closeMenu: () => void;
  inspect: (slug: string | null) => void;
  setDialogue: (node: string | null) => void;
  setTextPrompt: (open: boolean) => void;
  say: (text: string, kind?: ChatLine['kind'], from?: string) => void;
  setChatOpen: (open: boolean) => void;
  addXp: (skill: SkillId, amount: number) => void;
  clearLevelUp: () => void;
  dismissXp: (id: number) => void;
  addItem: (stack: ItemStack) => boolean;
  removeSlot: (slot: number) => ItemStack | null;
  swapSlots: (a: number, b: number) => void;
  hasItem: (id: ItemStack['id']) => boolean;
  markQuest: (slug: string, status: 'seen' | 'done') => void;
  setEffect: (id: EffectId, patch: Partial<EffectLayer>) => void;
  moveEffect: (id: EffectId, delta: -1 | 1) => void;
  applyPreset: (name: string) => void;
  togglePlugin: (key: keyof Plugins) => void;
  setPlugin: (key: keyof Plugins, value: boolean) => void;
  toggleHidden: (id: string) => void;
  toggleLocked: (id: string) => void;
  toggleMarker: (key: string) => void;
  walkTo: (tile: TilePos, onArrive?: () => void) => void;
  teleportTo: (tile: TilePos, onArrive?: () => void) => void;
  appearAt: (tile: TilePos, onArrive?: () => void) => void;
  cancelWalk: () => void;
  toggleRun: () => void;
  setCaffeine: (value: number) => void;
  eatMushroom: (seconds: number) => void;
  setDialOpen: (open: boolean) => void;
  select: (id: string | null) => void;
  setZone: (id: string | null) => void;
  resetProgress: () => void;
  setLocation: (location: PlaceId) => void;
  setIslandVisited: () => void;
  setBuildMode: (on: boolean) => void;
  setBuilding: (key: string | null) => void;
  setFurniture: (key: string, id: string | null) => void;
  resetHouse: () => void;
  setHouseStyle: (style: HouseStyleId | null) => void;
  setLoading: (text: string | null) => void;
  togglePrayer: (id: PrayerId) => void;
  playTrack: (index: number) => void;
  skipTrack: (dir: 1 | -1) => void;
  /** The player moving on by itself: no restart. */
  setMusicTrack: (index: number) => void;
  setMusicVolume: (volume: number) => void;
  setMusicMode: (mode: MusicMode) => void;
  toggleMusicPaused: () => void;
  hearTrack: (index: number) => void;
  /** Unlock a secret track. True if it was newly found. */
  unlockTrack: (id: string) => boolean;
  setLabDraft: (spec: CreatureSpec | null) => void;
  /** Add or replace (by id). False when the world is full. */
  upsertCreature: (spec: CreatureSpec) => boolean;
  removeCreature: (id: string) => void;
}

let lineId = 1;
let dropId = 1;
let destSeq = 1;
let levelSeq = 1;

/** Level 90 unlocks the full furniture catalog, including everything in the authored house. */
const DEFAULT_CONSTRUCTION_XP = XP_TABLE[90];

/** Everyone starts at 99 Cats (for the cape) and 90 Construction (for rebuilding). */
const emptySkills = () => Object.fromEntries(SKILLS.map((s) => [
  s.id,
  s.id === 'cats' ? XP_TABLE[99] : s.id === 'construction' ? DEFAULT_CONSTRUCTION_XP : 0,
])) as Record<SkillId, number>;
const cloneStack = (name: string) => EFFECT_PRESETS[name].stack.map((l) => ({ ...l }));

export const INVENTORY_SIZE = 28;
const starterInventory = () => withStarterKit(Array(INVENTORY_SIZE).fill(null));

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      stage: 'boot',
      introSeen: false,
      tab: null,
      tool: 'move',
      menu: null,
      inspecting: null,
      dialogue: null,
      textPrompt: false,
      chat: [],
      chatOpen: true,
      xpDrops: [],
      skills: emptySkills(),
      levelUp: null,
      inventory: starterInventory(),
      usingCatch: null,
      quests: {},
      effects: cloneStack('canvas'),
      palette: null,
      plugins: {
        tileMarkers: true,
        destinationTile: true,
        boundingBoxes: true,
        mouseover: true,
        xpDrops: true,
        fps: false,
        localSky: true,
        sound: false,
        minimap: true,
      },
      hidden: {},
      locked: {},
      markers: {},
      destination: null,
      running: true,
      caffeine: 100,
      mushroomUntil: 0,
      dialOpen: false,
      selected: null,
      zoneId: null,
      location: 'house',
      islandVisited: false,
      buildMode: false,
      houseEdits: {},
      houseStyle: null,
      building: null,
      loading: null,
      prayer: null,
      musicVolume: 0.6,
      musicMode: 'area',
      musicTrack: 0,
      musicSeq: 0,
      musicPaused: false,
      musicHeard: {},
      musicSecrets: {},
      creatures: [],
      labDraft: null,

      setStage: (stage) => set(stage === 'world' ? { stage, introSeen: true } : { stage, usingCatch: null }),
      setTab: (tab) => set({ tab }),
      setTool: (tool) => set({ tool }),
      openMenu: (menu) => {
        sfx('menu');
        set({ menu });
      },
      closeMenu: () => set({ menu: null }),
      inspect: (slug) => set({ inspecting: slug, menu: null, tab: slug ? null : get().tab, usingCatch: null }),
      setDialogue: (dialogue) => set({ dialogue, menu: null, usingCatch: null }),
      setTextPrompt: (textPrompt) => set({ textPrompt }),
      say: (text, kind = 'game', from) =>
        set((s) => ({ chat: [...s.chat.slice(-60), { id: lineId++, kind, from, text }] })),
      setChatOpen: (chatOpen) => set({ chatOpen }),

      addXp: (skill, amount) => {
        const before = get().skills[skill] ?? 0;
        const after = Math.min(200_000_000, before + amount);
        const lvBefore = levelForXp(before);
        const lvAfter = levelForXp(after);
        set((s) => ({
          skills: { ...s.skills, [skill]: after },
          xpDrops: s.plugins.xpDrops ? [...s.xpDrops.slice(-6), { id: dropId++, skill, amount }] : s.xpDrops,
        }));
        sfx('xp');
        if (lvAfter > lvBefore) {
          const name = skillById.get(skill)?.name ?? skill;
          set({ levelUp: { skill, level: lvAfter, seq: levelSeq++ } });
          get().say(`Congratulations! Your ${name} level is now ${lvAfter}.`, 'fx');
          sfx('levelup');
        }
      },
      clearLevelUp: () => set({ levelUp: null }),
      dismissXp: (id) => set((s) => ({ xpDrops: s.xpDrops.filter((d) => d.id !== id) })),

      addItem: (stack) => {
        const inv = get().inventory;
        const slot = inv.findIndex((s) => s === null);
        if (slot === -1) {
          get().say("You don't have enough inventory space.");
          sfx('error');
          return false;
        }
        const next = inv.slice();
        next[slot] = stack;
        set({ inventory: next });
        sfx('pickup');
        return true;
      },
      removeSlot: (slot) => {
        const inv = get().inventory.slice();
        const item = inv[slot];
        inv[slot] = null;
        set({ inventory: inv, usingCatch: null });
        return item;
      },
      swapSlots: (a, b) => {
        const inv = get().inventory.slice();
        [inv[a], inv[b]] = [inv[b], inv[a]];
        set({ inventory: inv, usingCatch: null });
      },
      hasItem: (id) => get().inventory.some((s) => s?.id === id),

      markQuest: (slug, status) =>
        set((s) => {
          const current = s.quests[slug];
          if (current === 'done' || current === status) return {};
          return { quests: { ...s.quests, [slug]: status } };
        }),

      setEffect: (id, patch) =>
        set((s) => ({ effects: s.effects.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
      moveEffect: (id, delta) =>
        set((s) => {
          const list = s.effects.slice();
          const i = list.findIndex((l) => l.id === id);
          const j = i + delta;
          if (i < 0 || j < 0 || j >= list.length) return {};
          [list[i], list[j]] = [list[j], list[i]];
          return { effects: list };
        }),
      applyPreset: (name) => {
        const preset = EFFECT_PRESETS[name];
        if (!preset) return;
        set({ effects: cloneStack(name), palette: preset.palette ?? null });
      },

      togglePlugin: (key) => set((s) => ({ plugins: { ...s.plugins, [key]: !s.plugins[key] } })),
      setPlugin: (key, value) => set((s) => ({ plugins: { ...s.plugins, [key]: value } })),
      toggleHidden: (id) =>
        set((s) => {
          const hidden = { ...s.hidden };
          if (hidden[id]) delete hidden[id];
          else hidden[id] = true;
          return { hidden };
        }),
      toggleLocked: (id) =>
        set((s) => {
          const locked = { ...s.locked };
          if (locked[id]) delete locked[id];
          else locked[id] = true;
          return { locked };
        }),
      toggleMarker: (key) =>
        set((s) => {
          const markers = { ...s.markers };
          if (markers[key]) delete markers[key];
          else markers[key] = true;
          return { markers };
        }),

      walkTo: (tile, onArrive) => set({ destination: { seq: destSeq++, tile, onArrive }, menu: null }),
      teleportTo: (tile, onArrive) =>
        set({ destination: { seq: destSeq++, tile, onArrive, teleport: true }, menu: null, usingCatch: null }),
      appearAt: (tile, onArrive) =>
        set({ destination: { seq: destSeq++, tile, onArrive, teleport: true, instant: true }, menu: null, usingCatch: null }),
      cancelWalk: () => set({ destination: null, usingCatch: null }),
      toggleRun: () => {
        const { running, caffeine } = get();
        if (!running && caffeine < 1) {
          get().say('You are too decaffeinated to run. Drink some tea.');
          sfx('error');
          return;
        }
        set({ running: !running });
      },
      setCaffeine: (caffeine) => {
        const clamped = Math.max(0, Math.min(100, caffeine));
        if (clamped <= 0 && get().running) {
          set({ caffeine: 0, running: false });
          get().say('You have run out of caffeine.');
          return;
        }
        set({ caffeine: clamped });
      },
      eatMushroom: (seconds) => set({ mushroomUntil: performance.now() + seconds * 1000 }),
      setDialOpen: (dialOpen) => set({ dialOpen }),
      select: (selected) => set({ selected }),
      setZone: (zoneId) => set({ zoneId }),
      resetProgress: () =>
        set({
          skills: emptySkills(),
          inventory: starterInventory(),
          usingCatch: null,
          quests: {},
          markers: {},
          introSeen: false,
          effects: cloneStack('canvas'),
          palette: null,
          islandVisited: false,
          houseEdits: {},
          houseStyle: null,
          musicSecrets: {},
          creatures: [],
          labDraft: null,
          // Don't leave a now-locked secret queued up.
          ...(trackLocked(get().musicTrack, {}) ? { musicTrack: 0, musicSeq: get().musicSeq + 1 } : {}),
        }),
      setLocation: (location) => {
        set({ location, zoneId: null, usingCatch: null });
        // Finding a place can turn up a secret track.
        for (const t of TRACKS) if (t.secret === location) get().unlockTrack(t.id);
      },
      setIslandVisited: () => set({ islandVisited: true }),
      setBuildMode: (buildMode) => set({ buildMode, building: buildMode ? get().building : null, menu: null, usingCatch: null }),
      setBuilding: (building) => set({ building, menu: null }),
      setFurniture: (key, id) => {
        const houseEdits = { ...get().houseEdits, [key]: id };
        rebuildHouse(houseEdits);
        set({ houseEdits });
      },
      resetHouse: () => {
        rebuildHouse({});
        set({ houseEdits: {} });
      },
      setHouseStyle: (houseStyle) => set({ houseStyle }),
      setLoading: (loading) => set({ loading, usingCatch: null }),
      playTrack: (index) => {
        if (!TRACKS[index]) return;
        if (trackLocked(index, get().musicSecrets)) {
          get().say("You haven't unlocked that track yet.", 'system');
          return;
        }
        set((s) => ({
          musicTrack: index,
          musicSeq: s.musicSeq + 1,
          musicPaused: false,
          musicVolume: s.musicVolume || 0.6,
          plugins: { ...s.plugins, sound: true },
        }));
      },
      skipTrack: (dir) => {
        const s = get();
        s.playTrack(nextTrack(s.musicTrack, s.musicMode, dir, false, musicArea(s.location, s.zoneId), s.musicSecrets));
      },
      setMusicTrack: (musicTrack) => {
        if (TRACKS[musicTrack] && !trackLocked(musicTrack, get().musicSecrets)) set({ musicTrack });
      },
      setMusicVolume: (musicVolume) => set({ musicVolume: Math.min(1, Math.max(0, musicVolume)) }),
      setMusicMode: (musicMode) => set({ musicMode }),
      toggleMusicPaused: () => set((s) => ({ musicPaused: !s.musicPaused })),
      hearTrack: (index) => {
        const track = TRACKS[index];
        if (!track || get().musicHeard[track.id]) return;
        set((s) => ({ musicHeard: { ...s.musicHeard, [track.id]: true } }));
        // Secrets are announced when they're found, not again on first listen.
        if (!track.secret) get().say(`You have unlocked a new music track: ${track.name}.`, 'game');
      },
      unlockTrack: (id) => {
        const track = TRACKS.find((t) => t.id === id);
        if (!track?.secret || get().musicSecrets[id]) return false;
        set((s) => ({ musicSecrets: { ...s.musicSecrets, [id]: true } }));
        get().say(`You have unlocked a secret music track: ${track.name}.`, 'game');
        return true;
      },
      setLabDraft: (labDraft) => set({ labDraft }),
      upsertCreature: (spec) => {
        const list = get().creatures;
        const i = list.findIndex((c) => c.id === spec.id);
        if (i < 0 && list.length >= MAX_CREATURES) return false;
        set({ creatures: i < 0 ? [...list, spec] : list.map((c) => (c.id === spec.id ? spec : c)) });
        return true;
      },
      removeCreature: (id) => set((s) => ({ creatures: s.creatures.filter((c) => c.id !== id), labDraft: s.labDraft?.id === id ? null : s.labDraft })),
      togglePrayer: (id) => {
        const on = get().prayer !== id;
        set({ prayer: on ? id : null });
        sfx(on ? 'prayer-on' : 'prayer-off');
      },
    }),
    {
      name: 'untitled-1.save',
      version: 2,
      // v2: everyone gets the starter kit once; consumed items don't come back.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<GameState>;
        if (version < 2 && Array.isArray(p.inventory) && p.inventory.length === INVENTORY_SIZE)
          return { ...p, inventory: withStarterKit(p.inventory) } as GameState;
        return p as GameState;
      },
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        introSeen: s.introSeen,
        skills: s.skills,
        inventory: s.inventory,
        quests: s.quests,
        effects: s.effects,
        palette: s.palette,
        plugins: s.plugins,
        markers: s.markers,
        hidden: s.hidden,
        caffeine: s.caffeine,
        islandVisited: s.islandVisited,
        houseEdits: s.houseEdits,
        houseStyle: s.houseStyle,
        prayer: s.prayer,
        musicVolume: s.musicVolume,
        musicMode: s.musicMode,
        musicHeard: s.musicHeard,
        musicSecrets: s.musicSecrets,
        creatures: s.creatures,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameState>;
        // Saves outlive code: drop anything that no longer exists rather than crash on it.
        const inventory =
          Array.isArray(p.inventory) && p.inventory.length === INVENTORY_SIZE
            ? p.inventory.map((s) => (s && ITEMS[s.id] ? s : null))
            : current.inventory;
        const effects = reconcileStack(p.effects, current.effects);
        const houseEdits = p.houseEdits && typeof p.houseEdits === 'object' ? p.houseEdits : {};
        if (Object.keys(houseEdits).length) rebuildHouse(houseEdits);
        return {
          ...current,
          ...p,
          skills: {
            ...current.skills,
            ...(p.skills ?? {}),
            // Returning visitors get the same building access without losing earned XP.
            construction: Math.max(DEFAULT_CONSTRUCTION_XP, p.skills?.construction ?? current.skills.construction),
          },
          plugins: { ...current.plugins, ...(p.plugins ?? {}) },
          inventory,
          effects,
          houseEdits,
          prayer: p.prayer && prayerById.has(p.prayer) ? p.prayer : null,
          musicVolume: typeof p.musicVolume === 'number' ? Math.min(1, Math.max(0, p.musicVolume)) : current.musicVolume,
          musicMode: p.musicMode === 'sequence' || p.musicMode === 'shuffle' || p.musicMode === 'loop' ? p.musicMode : 'area',
          musicHeard: p.musicHeard && typeof p.musicHeard === 'object' ? p.musicHeard : {},
          musicSecrets: p.musicSecrets && typeof p.musicSecrets === 'object' ? p.musicSecrets : {},
          creatures: Array.isArray(p.creatures)
            ? p.creatures.map(sanitizeSpec).filter((c): c is CreatureSpec => !!c).slice(0, MAX_CREATURES)
            : [],
        };
      },
    }
  )
);

export const gameState = () => useGame.getState();

export function totalLevel(skills: Record<SkillId, number>) {
  return SKILLS.reduce((sum, s) => sum + levelForXp(skills[s.id] ?? 0), 0);
}
