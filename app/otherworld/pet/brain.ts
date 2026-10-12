/**
 * What the cat does all day: pads around the house tile by tile, sits,
 * loafs, grooms, stretches, naps (in its basket when there is one), comes
 * over to see you, weaves round your legs, meows about it, and refuses to
 * be picked up. Pure logic over the house's tile grid and the shared A*
 * (../world/pathfinding), so it can be simulated headless.
 *
 * The house can be rebuilt under it (build mode moves walkability around),
 * so every step is re-checked before it's taken and `layoutChanged()`
 * re-paths, or hops it off a tile that just grew a table.
 */
import { dampAngle } from '../lib/random';
import { findPath, type Grid, type TilePos } from '../world/pathfinding';
import type { CatPose } from './cat';

/** Tiles travelled per full gait cycle (the model's stride is a quarter of this). */
export const CAT_STRIDE = 0.5;

export interface CatSettings {
  /** Tiles per second at a walk (it trots to you at 1.45×). */
  speed: number;
  /** 0 homebody … 1 explorer: how often it roams rather than settles, and how far. */
  wanderiness: number;
  /** How long it sits / loafs / stands about, in seconds. */
  idleMin: number;
  idleMax: number;
  /** Relative weight of a nap (in the basket if there is one). */
  napChance: number;
  /** Relative weight of coming over to see you. */
  visitChance: number;
  /** Chance per second of a meow while awake. */
  meowChance: number;
}

export const CAT_DEFAULTS: CatSettings = {
  speed: 1.3,
  wanderiness: 0.5,
  idleMin: 4,
  idleMax: 12,
  napChance: 0.25,
  visitChance: 0.35,
  meowChance: 0.025,
};

/** The kitchen cat basket, if one is built. */
export interface CatBasket {
  key: string;
  tile: TilePos;
  x: number;
  z: number;
  /** Cushion height. */
  y: number;
  /** Walkable tile in front of it. */
  approach: TilePos;
}

export interface CatWorld extends Grid {
  tileCenter(i: number, j: number): [number, number];
  basket(): CatBasket | null;
}

export interface CatPlayer {
  x: number;
  z: number;
  tile: TilePos;
  moving: boolean;
}

export type CatEvent = { type: 'meow'; text: string } | { type: 'flick' } | { type: 'twitch' };

export type CatMode = 'idle' | 'wander' | 'visit' | 'weave' | 'basket' | 'nap' | 'hold' | 'petted' | 'flee';

export const MEOWS = ['Meow.', 'Mrrp?', 'Mew!', 'Mrrrow.', 'Prrt?', 'Mraow.', 'Mrrp.'];

const RING: TilePos[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
const ORTHO: TilePos[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const same = (a: TilePos | null | undefined, b: TilePos | null | undefined) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
const cheb = (a: TilePos, b: TilePos) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

interface Step {
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  t: number;
  dur: number;
  to: TilePos;
}

interface Hop {
  fx: number;
  fz: number;
  fy: number;
  tx: number;
  tz: number;
  ty: number;
  t: number;
  dur: number;
  then: () => void;
}

export class CatBrain {
  /** Where it stands (tile movement) and how high (basket, hop arc). */
  x = 0;
  z = 0;
  y = 0;
  yaw = 0;
  tile: TilePos = [0, 0];
  pose: CatPose = 'stand';
  /** Seconds in the current pose. */
  poseT = 0;
  /** 0 idle, 1 walk, 1.45 trot. */
  gait = 0;
  /** Gait phase (radians), advanced by distance. */
  phase = 0;
  inBasket = false;
  mode: CatMode = 'idle';
  /** World point it's looking at (you, mostly). */
  look: { x: number; z: number } | null = null;
  /** Placed in the house yet. */
  present = false;
  readonly events: CatEvent[] = [];

  private time = 0;
  private until = 0;
  private path: TilePos[] = [];
  private goal: TilePos | null = null;
  private step: Step | null = null;
  private hopping: Hop | null = null;
  private pace = 1;
  private arrive: (() => void) | null = null;
  private face: { x: number; z: number } | null = null;
  /** How far it leans in toward you (weaving, being petted), and the drawn offset that results. */
  private hugTo = 0;
  private offX = 0;
  private offZ = 0;
  private visitGiveUp = 0;
  private sitOnMe = 0;
  private wokeUp = false;
  /** No more naps until this time (it just had one). */
  private napAgain = 0;
  private settings: CatSettings = CAT_DEFAULTS;
  private player: CatPlayer | null = null;

  constructor(
    private world: CatWorld,
    private rand: () => number = Math.random
  ) {}

  /** Drawn position: weaving pulls it in against your legs. */
  get px() {
    return this.x + this.offX;
  }
  get pz() {
    return this.z + this.offZ;
  }
  get moving() {
    return !!this.step || !!this.hopping;
  }
  get asleep() {
    return this.pose === 'sleep';
  }
  /** The tile it's on, or about to be on. */
  get here(): TilePos {
    return this.step ? this.step.to : this.tile;
  }

  // ── placing ───────────────────────────────────────────────────────────────
  /** First arrival: asleep in the basket if there is one, else somewhere near you. */
  spawn(player: CatPlayer | null) {
    this.present = true;
    this.player = player;
    const b = this.world.basket();
    if (b) {
      this.enterBasket(b);
      this.nap(8 + this.rand() * 8);
      this.yaw = this.rand() * Math.PI * 2;
      return;
    }
    const from = player?.tile ?? [Math.floor(this.world.width / 2), Math.floor(this.world.height / 2)];
    const t = this.pickTile(from, 2, 6, true) ?? this.nearestWalkable(from);
    if (t) this.placeAt(t);
    this.idle('sit', 3);
  }

  placeAt(t: TilePos) {
    this.tile = [t[0], t[1]];
    [this.x, this.z] = this.world.tileCenter(t[0], t[1]);
    this.y = 0;
    this.step = null;
    this.path = [];
    this.present = true;
  }

  // ── per frame ─────────────────────────────────────────────────────────────
  update(dt: number, settings: CatSettings, player: CatPlayer | null) {
    this.settings = settings;
    this.player = player;
    this.time += dt;
    this.poseT += dt;
    let moved = 0;

    if (this.hopping) {
      const h = this.hopping;
      h.t = Math.min(1, h.t + dt / h.dur);
      const u = h.t;
      this.x = h.fx + (h.tx - h.fx) * u;
      this.z = h.fz + (h.tz - h.fz) * u;
      this.y = h.fy + (h.ty - h.fy) * u + Math.sin(Math.PI * u) * 0.32;
      if (Math.hypot(h.tx - h.fx, h.tz - h.fz) > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(h.tx - h.fx, h.tz - h.fz), 14, dt);
      if (u >= 1) {
        this.hopping = null;
        this.y = h.ty;
        h.then();
      }
    } else {
      if (!this.step && this.path.length) this.nextStep();
      if (this.step) {
        const s = this.step;
        s.t = Math.min(1, s.t + dt / s.dur);
        const ox = this.x;
        const oz = this.z;
        this.x = s.fx + (s.tx - s.fx) * s.t;
        this.z = s.fz + (s.tz - s.fz) * s.t;
        moved = Math.hypot(this.x - ox, this.z - oz);
        this.yaw = dampAngle(this.yaw, Math.atan2(s.tx - s.fx, s.tz - s.fz), 12, dt);
        if (s.t >= 1) {
          this.tile = s.to;
          this.step = null;
          this.onTile();
          if (this.path.length) this.nextStep();
        }
      }
      if (!this.step && !this.path.length && this.arrive) {
        const cb = this.arrive;
        this.arrive = null;
        cb();
      }
    }

    const moving = this.moving;
    this.gait = this.step ? this.pace : 0;
    this.phase += (moved / CAT_STRIDE) * Math.PI * 2;
    if (moving && this.pose !== 'hop' && this.pose !== 'stand') this.setPose('stand');

    // turn to whatever it's attending to
    if (!moving && this.face) this.yaw = dampAngle(this.yaw, Math.atan2(this.face.x - this.x, this.face.z - this.z), 5, dt);
    // lean in toward you, but only while you're right there
    let ox = 0;
    let oz = 0;
    if (this.player && this.hugTo > 0 && !this.inBasket) {
      const dx = this.player.x - this.x;
      const dz = this.player.z - this.z;
      if (Math.hypot(dx, dz) < 1.6) {
        ox = dx * this.hugTo;
        oz = dz * this.hugTo;
      }
    }
    const lean = 1 - Math.exp(-4 * dt);
    this.offX += (ox - this.offX) * lean;
    this.offZ += (oz - this.offZ) * lean;

    // timed activities run out; trips that ended without a plan think again
    const travelling = this.mode === 'visit' || this.mode === 'basket' || this.mode === 'wander' || this.mode === 'weave' || this.mode === 'flee';
    if (!moving && !this.arrive && !this.path.length && (travelling || this.time >= this.until)) this.decide();
    if (this.mode === 'visit' && this.time > this.visitGiveUp) this.decide();

    // look at you when you're close and it's not busy
    const p = this.player;
    this.look = p && !moving && !this.asleep && Math.hypot(p.x - this.x, p.z - this.z) < 4 ? { x: p.x, z: p.z } : null;

    // chatter and fidgets
    const awake = !this.asleep && this.mode !== 'petted';
    if (awake && this.rand() < settings.meowChance * dt) this.meow();
    if (awake && !moving && this.rand() < 0.14 * dt) this.events.push({ type: 'flick' });
    if (this.rand() < 0.08 * dt) this.events.push({ type: 'twitch' });

    // you're standing on it: it gets up and moves over
    if (p && !p.moving && !this.inBasket && !moving && same(p.tile, this.tile) && this.mode !== 'petted' && this.mode !== 'hold') {
      this.sitOnMe += dt;
      if (this.sitOnMe > 0.8) {
        this.sitOnMe = 0;
        this.shuffleOff(p);
      }
    } else this.sitOnMe = 0;
  }

  // ── what next ─────────────────────────────────────────────────────────────
  private decide() {
    const s = this.settings;
    const p = this.player;
    const r = this.rand;
    this.hugTo = 0;
    this.face = null;
    this.path = [];
    this.arrive = null;
    if (this.inBasket) {
      // a nap ends in a stretch, and a hop out
      this.idle('stretch', 2.5, () => this.leaveBasket());
      return;
    }
    if (this.wokeUp) {
      this.wokeUp = false;
      this.idle('stretch', 2.5);
      return;
    }
    const far = p ? Math.hypot(p.x - this.x, p.z - this.z) > 1.8 : false;
    const basket = this.world.basket();
    const options: [number, () => boolean][] = [
      [0.6 + 2.6 * s.wanderiness, () => this.wander()],
      [1.1, () => this.idle('sit', this.idleTime())],
      [1.1 * (1.2 - s.wanderiness * 0.6), () => this.idle('loaf', this.idleTime() * 1.3)],
      [0.9, () => this.idle('groom', 3 + r() * 3)],
      [0.5, () => this.idle('stand', this.idleTime() * 0.5)],
      [0.35, () => this.idle('stretch', 2.5)],
      [p && far ? 4 * s.visitChance : 0, () => this.visit()],
      [this.time < this.napAgain ? 0 : 3 * s.napChance, () => (basket ? this.goToBasket() : this.nap(15 + r() * 20))],
    ];
    const total = options.reduce((a, [w]) => a + w, 0);
    let pick = r() * total;
    for (const [w, run] of options) {
      pick -= w;
      if (pick <= 0) {
        if (run()) return;
        break;
      }
    }
    this.idle('sit', 2);
  }

  private idleTime() {
    const { idleMin, idleMax } = this.settings;
    return idleMin + this.rand() * Math.max(0, idleMax - idleMin);
  }

  private setPose(p: CatPose) {
    if (p !== this.pose) {
      this.pose = p;
      this.poseT = 0;
    }
  }

  private idle(pose: CatPose, seconds: number, then?: () => void) {
    this.mode = 'idle';
    this.setPose(pose);
    this.until = this.time + seconds;
    if (then) {
      // run `then` when the time is up instead of deciding afresh
      const until = this.until;
      this.arrive = null;
      const check = () => {
        if (this.time >= until) then();
        else this.arrive = check;
      };
      this.arrive = check;
      this.path = [];
    }
    return true;
  }

  private nap(seconds: number) {
    this.mode = 'nap';
    this.setPose('sleep');
    this.until = this.time + seconds;
    this.napAgain = this.until + 90 + this.rand() * 90;
    this.wokeUp = !this.inBasket;
    return true;
  }

  private wander() {
    const reach = 2 + Math.round(this.settings.wanderiness * 6);
    const t = this.pickTile(this.here, 2, reach, false);
    if (!t) return false;
    this.mode = 'wander';
    return this.go(t, 1, () => this.settle());
  }

  /** After a walk: sit, loaf, groom, or just stand there a moment. */
  private settle() {
    const r = this.rand();
    if (r < 0.35) this.idle('sit', this.idleTime());
    else if (r < 0.55) this.idle('loaf', this.idleTime() * 1.3);
    else if (r < 0.75) this.idle('groom', 3 + this.rand() * 3);
    else this.idle('stand', 1 + this.rand() * 2);
  }

  // ── coming to see you ─────────────────────────────────────────────────────
  private visit() {
    const p = this.player;
    if (!p) return false;
    const t = this.besideYou(p);
    if (!t) return false;
    this.mode = 'visit';
    this.visitGiveUp = this.time + 15;
    return this.go(t, 1.45, () => this.arrived());
  }

  /** A free tile next to you, with no wall between, closest to the cat. */
  private besideYou(p: CatPlayer): TilePos | null {
    const W = this.world;
    let best: TilePos | null = null;
    let bestD = Infinity;
    for (const [di, dj] of RING) {
      const t: TilePos = [p.tile[0] + di, p.tile[1] + dj];
      if (!W.inBounds(t[0], t[1]) || !W.walkable(t[0], t[1]) || !W.canStep(t[0], t[1], -di, -dj)) continue;
      const d = Math.hypot(t[0] - this.here[0], t[1] - this.here[1]) + (di !== 0 && dj !== 0 ? 0.6 : 0);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private onTile() {
    // you moved off while it was on its way: aim again
    const p = this.player;
    if (this.mode === 'visit' && p && this.goal && cheb(this.goal, p.tile) !== 1) {
      const t = this.besideYou(p);
      if (t && !this.go(t, 1.45, () => this.arrived())) this.decide();
    }
  }

  private arrived() {
    const p = this.player;
    if (!p) return this.decide();
    this.face = { x: p.x, z: p.z };
    if (this.rand() < 0.6) this.meow(['Mrrp?', 'Mew!', 'Prrt?', 'Meow.'][Math.floor(this.rand() * 4)]);
    if (this.rand() < 0.5 && this.weave(p)) return;
    this.mode = 'idle';
    this.idle(this.rand() < 0.7 ? 'sit' : 'loaf', this.idleTime());
    this.face = { x: p.x, z: p.z };
  }

  /**
   * Round your legs: a few tiles of the ring around you, rubbing in close.
   * Where furniture's in the way it just passes back and forth in front of you.
   */
  private weave(p: CatPlayer) {
    const W = this.world;
    const k0 = RING.findIndex(([a, b]) => a === this.tile[0] - p.tile[0] && b === this.tile[1] - p.tile[1]);
    if (k0 < 0) return false;
    const free = (t: TilePos, from: TilePos) =>
      W.walkable(t[0], t[1]) && W.canStep(from[0], from[1], t[0] - from[0], t[1] - from[1]) && W.canStep(t[0], t[1], p.tile[0] - t[0], p.tile[1] - t[1]);
    const around = (dir: number) => {
      const out: TilePos[] = [];
      let prev = this.tile;
      let k = k0;
      const n = 4 + Math.floor(this.rand() * 4);
      for (let i = 0; i < n; i++) {
        k = (k + dir + 8) % 8;
        const t: TilePos = [p.tile[0] + RING[k][0], p.tile[1] + RING[k][1]];
        if (!free(t, prev)) break;
        out.push(t);
        prev = t;
      }
      return out;
    };
    const dir = this.rand() < 0.5 ? 1 : -1;
    let route = around(dir);
    if (route.length < 3) {
      const other = around(-dir);
      if (other.length > route.length) route = other;
    }
    if (route.length === 1 || route.length === 2) {
      // back and forth past your shins
      const a = route[0];
      const home: TilePos = [this.tile[0], this.tile[1]];
      route = [a, home, a, home];
    }
    if (!route.length) return false;
    this.mode = 'weave';
    this.path = route;
    this.goal = route[route.length - 1];
    this.pace = 0.75;
    this.hugTo = 0.34;
    this.arrive = () => {
      this.hugTo = 0;
      this.idle('sit', this.idleTime());
      const q = this.player;
      if (q) this.face = { x: q.x, z: q.z };
    };
    return true;
  }

  // ── the basket ────────────────────────────────────────────────────────────
  private goToBasket() {
    const b = this.world.basket();
    if (!b) return false;
    this.mode = 'basket';
    return this.go(b.approach, 1, () => {
      const now = this.world.basket();
      if (!now || !same(now.tile, b.tile)) return this.decide();
      this.jump(now.x, now.z, now.y, () => {
        this.enterBasket(now);
        this.nap(20 + this.rand() * 25);
      });
    });
  }

  private enterBasket(b: CatBasket) {
    this.inBasket = true;
    this.tile = [b.tile[0], b.tile[1]];
    this.x = b.x;
    this.z = b.z;
    this.y = b.y;
    this.path = [];
    this.step = null;
  }

  private leaveBasket() {
    const b = this.world.basket();
    const to = b && this.world.walkable(b.approach[0], b.approach[1]) ? b.approach : this.nearestWalkable(this.tile);
    if (!to) {
      this.inBasket = false;
      this.y = 0;
      return this.decide();
    }
    const [x, z] = this.world.tileCenter(to[0], to[1]);
    this.jump(x, z, 0, () => {
      this.inBasket = false;
      this.tile = [to[0], to[1]];
      // just woke up: probably wants to see you
      if (this.player && this.rand() < 0.6 && this.visit()) return;
      this.decide();
    });
  }

  private jump(x: number, z: number, y: number, then: () => void) {
    this.setPose('hop');
    this.path = [];
    this.step = null;
    this.hopping = { fx: this.x, fz: this.z, fy: this.y, tx: x, tz: z, ty: y, t: 0, dur: 0.45, then };
  }

  // ── you ───────────────────────────────────────────────────────────────────
  /** You're coming over to do something to it: it stops and waits (unless asleep). */
  hold(seconds: number, player: CatPlayer) {
    this.player = player;
    if (this.inBasket || this.hopping) {
      this.until = Math.max(this.until, this.time + seconds);
      return;
    }
    const sitDown = () => {
      this.mode = 'hold';
      this.hugTo = 0;
      if (!this.asleep) this.setPose(this.pose === 'loaf' ? 'loaf' : 'sit');
      this.until = this.time + seconds;
      // a sleeping cat doesn't get up to watch you come over
      this.face = this.asleep ? null : { x: player.x, z: player.z };
    };
    this.path = [];
    this.goal = null;
    this.arrive = null;
    if (this.step) this.arrive = sitDown;
    else sitDown();
  }

  /** Being petted: leans in and purrs, then hangs around (or goes back to sleep). */
  pet(seconds: number, player: CatPlayer) {
    this.player = player;
    const start = () => {
      this.mode = 'petted';
      // shuffle in under the hand (not out of the basket, though)
      this.hugTo = this.inBasket ? 0 : 0.12;
      this.face = { x: player.x, z: player.z };
      this.setPose(this.inBasket || this.pose === 'loaf' || this.pose === 'sleep' ? 'purr' : 'petted');
      this.until = this.time + seconds;
      const after = this.inBasket;
      this.arrive = null;
      const done = () => {
        if (this.time < this.until) {
          this.arrive = done;
          return;
        }
        this.hugTo = 0;
        if (after && this.inBasket) this.nap(15 + this.rand() * 25);
        else this.idle(this.rand() < 0.6 ? 'sit' : 'loaf', this.idleTime());
        this.face = { x: player.x, z: player.z };
      };
      this.arrive = done;
    };
    this.path = [];
    this.goal = null;
    if (this.step || this.hopping) this.arrive = start;
    else start();
  }

  /** Turns to listen, which is more than you'll get from most cats. */
  listen(seconds: number, player: CatPlayer) {
    const dozing = this.asleep;
    if (this.inBasket) {
      // talking to it wakes it, a bit; it'll get up after
      if (dozing) this.setPose('purr');
      this.until = this.time + seconds;
      this.mode = 'idle';
      return;
    }
    this.hold(seconds, player);
    if (dozing) {
      this.setPose('purr');
      this.face = { x: player.x, z: player.z };
    }
  }

  /** You tried to pick it up. It would rather you didn't. */
  decline(player: CatPlayer) {
    this.player = player;
    this.events.push({ type: 'flick' }, { type: 'twitch' });
    if (this.inBasket) {
      this.idle('loaf', 4);
      return;
    }
    const away = this.awayFrom(player);
    this.mode = 'flee';
    this.face = null;
    if (!away || !this.go(away, 1.6, () => this.idle('groom', 3 + this.rand() * 2))) this.idle('groom', 3);
  }

  private shuffleOff(p: CatPlayer) {
    const t = this.awayFrom(p, 1);
    if (!t) return;
    this.mode = 'wander';
    this.go(t, 1, () => {
      this.idle('sit', this.idleTime());
      this.face = { x: p.x, z: p.z };
    });
  }

  /** A reachable tile `dist` or so from you, on the far side of the cat. */
  private awayFrom(p: CatPlayer, dist = 2): TilePos | null {
    let best: TilePos | null = null;
    let bestScore = -Infinity;
    const W = this.world;
    for (let dj = -dist; dj <= dist; dj++)
      for (let di = -dist; di <= dist; di++) {
        const t: TilePos = [this.tile[0] + di, this.tile[1] + dj];
        if (same(t, this.tile) || same(t, p.tile) || !W.inBounds(t[0], t[1]) || !W.walkable(t[0], t[1])) continue;
        const score = Math.hypot(t[0] - p.tile[0], t[1] - p.tile[1]) - Math.hypot(di, dj) * 0.3 + this.rand() * 0.2;
        if (score <= bestScore) continue;
        const path = findPath(W, this.tile, t, 400);
        if (!path.length || !same(path[path.length - 1], t) || path.length > dist * 2 + 1) continue;
        bestScore = score;
        best = t;
      }
    return best;
  }

  /** The tile you should walk to, to be next to it. */
  approachTile(p: CatPlayer): TilePos | null {
    const W = this.world;
    if (this.inBasket) return this.world.basket()?.approach ?? null;
    const c = this.here;
    if (cheb(c, p.tile) === 1 && W.canStep(p.tile[0], p.tile[1], c[0] - p.tile[0], c[1] - p.tile[1])) return [p.tile[0], p.tile[1]];
    let best: TilePos | null = null;
    let bestD = Infinity;
    for (const [di, dj] of [...ORTHO, ...RING.filter(([a, b]) => a !== 0 && b !== 0)]) {
      const t: TilePos = [c[0] + di, c[1] + dj];
      if (!W.inBounds(t[0], t[1]) || !W.walkable(t[0], t[1]) || !W.canStep(t[0], t[1], -di, -dj)) continue;
      const d = Math.hypot(t[0] - p.tile[0], t[1] - p.tile[1]) + (di !== 0 && dj !== 0 ? 3 : 0);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  // ── the house changed ─────────────────────────────────────────────────────
  layoutChanged() {
    const W = this.world;
    const b = W.basket();
    if (this.inBasket) {
      if (!b || !same(b.tile, this.tile)) {
        // the basket's gone out from under it
        this.inBasket = false;
        const to = this.nearestWalkable(this.tile);
        if (to) {
          const [x, z] = W.tileCenter(to[0], to[1]);
          this.jump(x, z, 0, () => {
            this.tile = [to[0], to[1]];
            this.meow('Mrrrow?');
            this.idle('sit', 3);
          });
        } else this.y = 0;
      }
      return;
    }
    if (this.mode === 'basket' && !b) {
      this.path = [];
      this.arrive = null;
      this.idle('sit', 2);
    }
    const here = this.here;
    if (!W.walkable(here[0], here[1])) {
      // something was built right where it was standing
      const to = this.nearestWalkable(here);
      if (to) {
        const [x, z] = W.tileCenter(to[0], to[1]);
        this.jump(x, z, 0, () => {
          this.tile = [to[0], to[1]];
          this.idle('sit', 3);
        });
      }
      return;
    }
    if (this.path.length && this.goal) {
      const after = this.arrive;
      if (!this.go(this.goal, this.pace, after ?? undefined)) {
        this.path = [];
        this.arrive = null;
        this.idle('sit', 2);
      }
    }
  }

  // ── walking ───────────────────────────────────────────────────────────────
  private go(goal: TilePos, pace: number, onArrive?: () => void) {
    const start = this.here;
    this.pace = pace;
    this.goal = [goal[0], goal[1]];
    if (same(start, goal)) {
      this.path = [];
      this.arrive = onArrive ?? null;
      return true;
    }
    const path = findPath(this.world, start, goal, 3000);
    if (!path.length || !same(path[path.length - 1], goal)) return false;
    this.path = path;
    this.arrive = onArrive ?? null;
    return true;
  }

  private nextStep() {
    const next = this.path[0];
    const [i, j] = this.tile;
    const di = next[0] - i;
    const dj = next[1] - j;
    if (Math.max(Math.abs(di), Math.abs(dj)) !== 1 || !this.world.canStep(i, j, di, dj)) {
      // the way is blocked now: find another, or give up and think again
      const goal = this.goal;
      const after = this.arrive;
      this.path = [];
      if (!goal || !this.go(goal, this.pace, after ?? undefined)) {
        this.arrive = null;
        this.idle('sit', 1.5);
      }
      return;
    }
    this.path.shift();
    const [tx, tz] = this.world.tileCenter(next[0], next[1]);
    const dur = (di !== 0 && dj !== 0 ? Math.SQRT2 : 1) / Math.max(0.1, this.settings.speed * this.pace);
    this.step = { fx: this.x, fz: this.z, tx, tz, t: 0, dur, to: [next[0], next[1]] };
    this.setPose('stand');
  }

  /** A random walkable tile `min`–`max` away that it can actually reach. */
  private pickTile(from: TilePos, min: number, max: number, anyReach: boolean): TilePos | null {
    const W = this.world;
    const avoid = this.player?.tile;
    for (let tries = 0; tries < 16; tries++) {
      const a = this.rand() * Math.PI * 2;
      const d = min + this.rand() * Math.max(0, max - min);
      const t: TilePos = [Math.round(from[0] + Math.cos(a) * d), Math.round(from[1] + Math.sin(a) * d)];
      if (!W.inBounds(t[0], t[1]) || !W.walkable(t[0], t[1]) || same(t, avoid) || same(t, from)) continue;
      if (anyReach) return t;
      const path = findPath(W, from, t, 3000);
      if (path.length && same(path[path.length - 1], t)) return t;
    }
    return null;
  }

  private nearestWalkable(from: TilePos): TilePos | null {
    const W = this.world;
    for (let r = 0; r <= 8; r++) {
      let best: TilePos | null = null;
      let bestD = Infinity;
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const t: TilePos = [from[0] + di, from[1] + dj];
          if (!W.inBounds(t[0], t[1]) || !W.walkable(t[0], t[1])) continue;
          const d = Math.hypot(di, dj);
          if (d < bestD) {
            bestD = d;
            best = t;
          }
        }
      if (best) return best;
    }
    return null;
  }

  private meow(text?: string) {
    this.events.push({ type: 'meow', text: text ?? MEOWS[Math.floor(this.rand() * MEOWS.length)] });
  }
}
