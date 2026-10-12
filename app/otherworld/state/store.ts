'use client';

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { SkillId } from '@/content/works';
import type { TilePos } from '../world/pathfinding';
import { EFFECT_PRESETS, type EffectId, type EffectLayer } from './effects';
import { sfx } from './events';
import type { ItemStack } from './items';
import { SKILLS, levelForXp, skillById } from './skills';

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
export type Tab = 'inventory' | 'skills' | 'quests' | 'layers' | 'effects' | 'plugins';
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
  sound: { name: 'Sound', blurb: 'Synthesised blips. No samples.' },
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
  cancelWalk: () => void;
  toggleRun: () => void;
  setCaffeine: (value: number) => void;
  eatMushroom: (seconds: number) => void;
  setDialOpen: (open: boolean) => void;
  select: (id: string | null) => void;
  setZone: (id: string | null) => void;
  resetProgress: () => void;
}

let lineId = 1;
let dropId = 1;
let destSeq = 1;
let levelSeq = 1;

const emptySkills = () => Object.fromEntries(SKILLS.map((s) => [s.id, 0])) as Record<SkillId, number>;
const cloneStack = (name: string) => EFFECT_PRESETS[name].stack.map((l) => ({ ...l }));

export const INVENTORY_SIZE = 28;

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
      inventory: Array(INVENTORY_SIZE).fill(null),
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
      running: false,
      caffeine: 100,
      mushroomUntil: 0,
      dialOpen: false,
      selected: null,
      zoneId: null,

      setStage: (stage) => set(stage === 'world' ? { stage, introSeen: true } : { stage }),
      setTab: (tab) => set({ tab }),
      setTool: (tool) => set({ tool }),
      openMenu: (menu) => {
        sfx('menu');
        set({ menu });
      },
      closeMenu: () => set({ menu: null }),
      inspect: (slug) => set({ inspecting: slug, menu: null, tab: slug ? null : get().tab }),
      setDialogue: (dialogue) => set({ dialogue, menu: null }),
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
        set({ inventory: inv });
        return item;
      },
      swapSlots: (a, b) => {
        const inv = get().inventory.slice();
        [inv[a], inv[b]] = [inv[b], inv[a]];
        set({ inventory: inv });
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
        set({ destination: { seq: destSeq++, tile, onArrive, teleport: true }, menu: null }),
      cancelWalk: () => set({ destination: null }),
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
          inventory: Array(INVENTORY_SIZE).fill(null),
          quests: {},
          markers: {},
          introSeen: false,
          effects: cloneStack('canvas'),
          palette: null,
        }),
    }),
    {
      name: 'untitled-1.save',
      version: 1,
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
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameState>;
        return {
          ...current,
          ...p,
          skills: { ...current.skills, ...(p.skills ?? {}) },
          plugins: { ...current.plugins, ...(p.plugins ?? {}) },
          inventory:
            Array.isArray(p.inventory) && p.inventory.length === INVENTORY_SIZE ? p.inventory : current.inventory,
          effects:
            Array.isArray(p.effects) && p.effects.length === current.effects.length ? p.effects : current.effects,
        };
      },
    }
  )
);

export const gameState = () => useGame.getState();

export function totalLevel(skills: Record<SkillId, number>) {
  return SKILLS.reduce((sum, s) => sum + levelForXp(skills[s.id] ?? 0), 0);
}
