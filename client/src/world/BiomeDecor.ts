import { BIOMES, STEPS, WIN_PADS, WIN_PAD_STEP, type StepDefinition } from '@highjump/shared';
import { blocksBiomeSign } from './biomeSignLayout.js';
import {
  BoxGeometry,
  BufferAttribute,
  Color,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Scenery for every biome: props, rocks, vegetation, riser outcrops, ground
 * patches and (higher up) floating details.
 *
 * Everything is a coloured BOX. Parts are written into merged geometry with
 * the colour in the vertices, so the whole staircase's scenery is ONE lit
 * material and ONE unlit "glow" material - two draw calls per biome - however
 * many props there are. Scenery is purely visual: nothing here collides, and
 * nothing is placed on a win pad or down the middle of a step.
 *
 * Placement is seeded per step, so every client draws the same world.
 */

/** One box of a prop, in the prop's local space (y = 0 is the ground). */
interface Part {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  c: number;
  rx?: number;
  ry?: number;
  rz?: number;
  glow?: boolean;
}

type Rand = () => number;
type Prop = (r: Rand) => Part[];

const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, extra: Partial<Part> = {}): Part => ({
  w, h, d, x, y: y + h / 2, z, c, ...extra,
});

const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length)] as T;

// ------------------------------------------------------------------ props

const rock = (colors: readonly number[]): Prop => (r) => {
  const s = 0.7 + r() * 0.8;
  const c = pick(r, colors);
  return [
    box(1.6 * s, 1 * s, 1.3 * s, 0, 0, 0, c, { ry: r() * 3 }),
    box(0.9 * s, 0.7 * s, 1 * s, 0.7 * s, 0, 0.4 * s, pick(r, colors), { ry: r() * 3 }),
  ];
};

const pebbles = (colors: readonly number[]): Prop => (r) =>
  [0, 1, 2].map((i) => box(0.35 + r() * 0.3, 0.25, 0.35 + r() * 0.3, (r() - 0.5) * 1.6, 0, (r() - 0.5) * 1.6, pick(r, colors), { ry: r() * 3 + i }));

const tuft = (colors: readonly number[]): Prop => (r) => {
  const c = pick(r, colors);
  return [-0.4, -0.13, 0.13, 0.4].map((x, i) =>
    box(0.22, 0.9 + r() * 0.7, 0.22, x, 0, (r() - 0.5) * 0.5, c, { rz: (i - 1.5) * 0.3 }),
  );
};

const flower = (heads: readonly number[]): Prop => (r) => {
  const h = 0.9 + r() * 0.7;
  return [
    box(0.16, h, 0.16, 0, 0, 0, 0x3f9b2f),
    box(0.5, 0.12, 0.25, 0.25, h * 0.45, 0, 0x4fc34a, { rz: 0.4 }),
    box(0.8, 0.28, 0.8, 0, h, 0, pick(r, heads), { ry: r() * 3 }),
    box(0.32, 0.3, 0.32, 0, h + 0.02, 0, 0xffe14d),
  ];
};

const bush = (colors: readonly number[]): Prop => (r) => {
  const s = 0.8 + r() * 0.6;
  return [
    box(1.6 * s, 1.1 * s, 1.5 * s, 0, 0, 0, pick(r, colors)),
    box(1.1 * s, 1 * s, 1.1 * s, 0.9 * s, 0, 0.3 * s, pick(r, colors), { ry: 0.4 }),
    box(1 * s, 0.9 * s, 1 * s, -0.8 * s, 0, -0.2 * s, pick(r, colors), { ry: 0.8 }),
  ];
};

const roundTree = (leaves: readonly number[], trunk = 0x7a4a24): Prop => (r) => {
  const s = 0.9 + r() * 0.6;
  const l = pick(r, leaves);
  return [
    box(0.8 * s, 3 * s, 0.8 * s, 0, 0, 0, trunk),
    box(3.2 * s, 2.2 * s, 3.2 * s, 0, 2.6 * s, 0, l),
    box(2.2 * s, 1.4 * s, 2.2 * s, 0, 4.6 * s, 0, l, { ry: 0.5 }),
  ];
};

const pine = (leaves: readonly number[], snow = false): Prop => (r) => {
  const s = 0.9 + r() * 0.7;
  const l = pick(r, leaves);
  const parts = [box(0.6 * s, 1.6 * s, 0.6 * s, 0, 0, 0, 0x5c3a1e)];
  [3.2, 2.4, 1.5].forEach((w, i) => {
    parts.push(box(w * s, 1.3 * s, w * s, 0, (1.4 + i * 1.15) * s, 0, l, { ry: i * 0.4 }));
    if (snow) parts.push(box(w * s * 0.8, 0.25 * s, w * s * 0.8, 0, (2.7 + i * 1.15) * s, 0, 0xf4f8ff, { ry: i * 0.4 }));
  });
  return parts;
};

const log: Prop = (r) => {
  const len = 3 + r() * 2;
  const ry = r() * 3;
  return [
    box(len, 0.9, 0.9, 0, 0, 0, 0x7a4a24, { ry }),
    box(0.2, 0.75, 0.75, Math.cos(ry) * len * 0.5, 0.07, -Math.sin(ry) * len * 0.5, 0xc79a5c, { ry }),
  ];
};

const mushroom: Prop = (r) => {
  const s = 0.6 + r() * 0.6;
  return [box(0.4 * s, 1 * s, 0.4 * s, 0, 0, 0, 0xf1e9d8), box(1.4 * s, 0.5 * s, 1.4 * s, 0, 1 * s, 0, pick(r, [0xe23b3b, 0xd9822b])), box(0.3 * s, 0.1 * s, 0.3 * s, 0.3 * s, 1.5 * s, 0.2 * s, 0xffffff)];
};

const coral = (colors: readonly number[]): Prop => (r) => {
  const c = pick(r, colors);
  return [
    box(0.35, 1.8 + r(), 0.35, 0, 0, 0, c),
    box(0.3, 1.2, 0.3, 0.45, 0.4, 0, c, { rz: -0.5 }),
    box(0.3, 1, 0.3, -0.4, 0.2, 0.2, c, { rz: 0.5 }),
  ];
};

const shell: Prop = (r) => [
  box(0.8, 0.25, 0.65, 0, 0, 0, pick(r, [0xffc8d6, 0xfff0c9, 0xffb38a]), { ry: r() * 3 }),
  box(0.5, 0.15, 0.1, 0, 0.25, 0, 0xffffff),
];

const starfish: Prop = (r) => {
  const c = pick(r, [0xff7a4d, 0xffb84d, 0xff5f9a]);
  const ry = r() * 3;
  return [box(1.4, 0.15, 0.3, 0, 0, 0, c, { ry }), box(1.4, 0.15, 0.3, 0, 0, 0, c, { ry: ry + 1.26 }), box(1.4, 0.15, 0.3, 0, 0, 0, c, { ry: ry + 2.5 })];
};

const palm: Prop = (r) => {
  const parts: Part[] = [];
  for (let i = 0; i < 5; i += 1) parts.push(box(0.7, 1.1, 0.7, i * 0.15, i * 1.05, 0, 0x9c6b3a, { rz: -0.05 }));
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + r();
    parts.push(box(3, 0.2, 0.9, 0.75 + Math.cos(a) * 1.3, 5.3, Math.sin(a) * 1.3, 0x2fae42, { ry: -a, rz: 0.35 }));
  }
  return parts;
};

const crystal = (colors: readonly number[], scale = 1): Prop => (r) => {
  const c = pick(r, colors);
  const s = scale * (0.7 + r() * 0.7);
  return [
    box(0.8 * s, 3 * s, 0.8 * s, 0, 0, 0, c, { ry: 0.78, glow: true }),
    box(0.6 * s, 2 * s, 0.6 * s, 0.7 * s, 0, 0.2 * s, c, { ry: 0.78, rz: -0.35, glow: true }),
    box(0.5 * s, 1.6 * s, 0.5 * s, -0.6 * s, 0, -0.3 * s, c, { ry: 0.78, rz: 0.4, glow: true }),
    box(1.8 * s, 0.4 * s, 1.6 * s, 0, 0, 0, 0x4b4560),
  ];
};

const cactus: Prop = (r) => {
  const h = 2.4 + r() * 1.6;
  const c = pick(r, [0x3f9b3a, 0x2f8a3a]);
  return [
    box(0.9, h, 0.9, 0, 0, 0, c),
    box(0.9, 0.5, 0.5, 0.8, h * 0.45, 0, c),
    box(0.5, 1.1, 0.5, 1.1, h * 0.45, 0, c),
    box(0.9, 0.5, 0.5, -0.8, h * 0.6, 0, c),
    box(0.5, 0.9, 0.5, -1.1, h * 0.6, 0, c),
    box(0.3, 0.3, 0.3, 0, h, 0, 0xff6fb5),
  ];
};

const mesa: Prop = (r) => {
  const s = 0.9 + r() * 0.7;
  return [
    box(3 * s, 2.2 * s, 2.4 * s, 0, 0, 0, 0xc9784a),
    box(2.2 * s, 1.6 * s, 1.8 * s, 0.2, 2.2 * s, 0.1, 0xb5663c),
    box(2.4 * s, 0.3 * s, 2 * s, 0.2, 3.8 * s, 0.1, 0xd99a66),
  ];
};

const dune: Prop = (r) => [
  box(5 + r() * 2, 0.5, 3, 0, 0, 0, 0xf0cf86, { ry: r() * 3 }),
  box(3, 0.5, 2, 0.3, 0.5, 0.2, 0xe8c070, { ry: r() * 3 }),
];

const bones: Prop = (r) => {
  const ry = r() * 3;
  return [box(1.6, 0.2, 0.25, 0, 0, 0, 0xf4efe4, { ry }), box(0.35, 0.3, 0.45, Math.cos(ry) * 0.8, 0, -Math.sin(ry) * 0.8, 0xf4efe4, { ry })];
};

const spire = (rockColor: number, cap: number): Prop => (r) => {
  const s = 0.9 + r() * 0.8;
  return [
    box(2.6 * s, 3 * s, 2.4 * s, 0, 0, 0, rockColor, { ry: r() * 3 }),
    box(1.7 * s, 2.4 * s, 1.6 * s, 0.2, 3 * s, 0, rockColor, { ry: r() * 3 }),
    box(1.9 * s, 0.5 * s, 1.8 * s, 0.2, 5.3 * s, 0, cap),
  ];
};

const snowPile: Prop = (r) => [box(2 + r(), 0.6, 1.6, 0, 0, 0, 0xf4f8ff, { ry: r() * 3 }), box(1.1, 0.5, 1, 0.3, 0.6, 0, 0xffffff)];

const snowman: Prop = (r) => [
  box(1.5, 1.4, 1.5, 0, 0, 0, 0xffffff, { ry: r() }),
  box(1.1, 1, 1.1, 0, 1.4, 0, 0xffffff, { ry: r() }),
  box(0.8, 0.8, 0.8, 0, 2.4, 0, 0xffffff),
  box(0.15, 0.15, 0.5, 0, 2.8, -0.55, 0xff8a1f),
  box(0.9, 0.25, 0.9, 0, 3.2, 0, 0x2b2f3a),
];

const vent: Prop = (r) => {
  const s = 0.9 + r() * 0.6;
  return [
    box(3 * s, 1.4 * s, 3 * s, 0, 0, 0, 0x3a2a26),
    box(2.1 * s, 1.3 * s, 2.1 * s, 0, 1.4 * s, 0, 0x2a1d1a),
    box(1.2 * s, 0.3 * s, 1.2 * s, 0, 2.7 * s, 0, 0xff6a1f, { glow: true }),
  ];
};

const lavaRock: Prop = (r) => [
  box(1.4, 0.9, 1.2, 0, 0, 0, 0x1f1a1c, { ry: r() * 3 }),
  box(1.45, 0.12, 0.2, 0, 0.5, 0, 0xff7a1f, { ry: r() * 3, glow: true }),
];

const column: Prop = (r) => {
  const h = 3 + r() * 3;
  return [
    box(1.8, 0.4, 1.8, 0, 0, 0, 0xe8e4da),
    box(1.1, h, 1.1, 0, 0.4, 0, 0xf7f4ec),
    box(1.9, 0.5, 1.9, 0, h + 0.4, 0, 0xffc933),
  ];
};

const cloudPuff = (color = 0xffffff): Prop => (r) => {
  const s = 0.8 + r() * 0.8;
  return [
    box(2.4 * s, 1 * s, 1.6 * s, 0, 0, 0, color),
    box(1.4 * s, 1 * s, 1.2 * s, 0.4 * s, 0.7 * s, 0, color),
    box(1.2 * s, 0.8 * s, 1 * s, -0.9 * s, 0.3 * s, 0.2, color),
  ];
};

const star = (color: number): Prop => (r) => {
  const s = 0.5 + r() * 0.5;
  return [box(1.2 * s, 1.2 * s, 0.3 * s, 0, 0, 0, color, { rz: 0.78, glow: true }), box(0.8 * s, 0.8 * s, 0.35 * s, 0, 0.2 * s, 0, 0xffffff, { rz: 0.78, glow: true })];
};

const lollipop: Prop = (r) => {
  const h = 3 + r() * 2;
  const c = pick(r, [0xff4fa3, 0x4fb8ff, 0x9dff5c, 0xffb84d]);
  return [box(0.25, h, 0.25, 0, 0, 0, 0xffffff), box(2, 2, 0.4, 0, h, 0, c, { ry: r() * 3 }), box(1, 1, 0.45, 0, h + 0.5, 0, 0xffffff, { ry: r() * 3 })];
};

const candyCane: Prop = (r) => {
  const parts: Part[] = [];
  for (let i = 0; i < 6; i += 1) parts.push(box(0.6, 0.6, 0.6, 0, i * 0.6, 0, i % 2 ? 0xffffff : 0xe23b3b));
  parts.push(box(0.6, 0.6, 0.6, 0.6, 3.3, 0, 0xffffff), box(0.6, 0.6, 0.6, 1.2, 2.9, 0, 0xe23b3b));
  const ry = r() * 3;
  return parts.map((p) => ({ ...p, ry }));
};

const gumdrop: Prop = (r) => {
  const c = pick(r, [0xff4fa3, 0x7dff5c, 0xffe14d, 0x9d7aff]);
  return [box(1.1, 0.7, 1.1, 0, 0, 0, c), box(0.7, 0.5, 0.7, 0, 0.7, 0, c)];
};

const cupcake: Prop = (r) => [
  box(1.2, 0.8, 1.2, 0, 0, 0, 0x9c5a2a),
  box(1.4, 0.6, 1.4, 0, 0.8, 0, pick(r, [0xffb8dc, 0xfff0c9, 0xb8e8ff])),
  box(0.35, 0.35, 0.35, 0, 1.4, 0, 0xe23b3b),
];

const balloon: Prop = (r) => {
  const c = pick(r, [0xff5a5a, 0xffc933, 0x4fb8ff]);
  return [
    box(0.08, 4, 0.08, 0, 0, 0, 0xdddddd),
    box(1.6, 2, 1.6, 0, 4, 0, c),
    box(1, 0.4, 1, 0, 6, 0, c),
  ];
};

const antenna: Prop = () => [
  box(0.25, 5, 0.25, 0, 0, 0, 0x9aa3ad),
  box(2, 0.2, 2, 0, 4.4, 0, 0xdfe6ef, { rx: 0.5 }),
  box(0.3, 0.3, 0.3, 0, 5, 0, 0xff3b3b, { glow: true }),
];

const satellite: Prop = (r) => {
  const ry = r() * 3;
  return [
    box(0.3, 2.5, 0.3, 0, 0, 0, 0x6b7280),
    box(1.2, 1.2, 1.2, 0, 2.5, 0, 0xd9d9d9, { ry }),
    box(3, 0.1, 1, 0, 3.05, 0, 0x2a5fe0, { ry, glow: true }),
  ];
};

const crater: Prop = (r) => {
  const s = 1 + r();
  const c = 0x4a4e5a;
  return [
    box(2.6 * s, 0.35, 0.5 * s, 0, 0, 1.05 * s, c),
    box(2.6 * s, 0.35, 0.5 * s, 0, 0, -1.05 * s, c),
    box(0.5 * s, 0.35, 1.6 * s, 1.05 * s, 0, 0, c),
    box(0.5 * s, 0.35, 1.6 * s, -1.05 * s, 0, 0, c),
    box(1.6 * s, 0.05, 1.6 * s, 0, 0, 0, 0x2a2d36),
  ];
};

const flag: Prop = (r) => [box(0.12, 3, 0.12, 0, 0, 0, 0xdddddd), box(1.4, 0.9, 0.05, 0.7, 2.1, 0, pick(r, [0xff3b3b, 0x3aa8ff, 0xffe14d]))];

const orbPillar = (glow: number): Prop => (r) => {
  const h = 2.5 + r() * 3;
  return [box(1.2, h, 1.2, 0, 0, 0, 0x2a1447), box(1.5, 0.3, 1.5, 0, h, 0, 0x5a2b8a), box(0.9, 0.9, 0.9, 0, h + 0.8, 0, glow, { rx: 0.6, ry: 0.78, glow: true })];
};

// ----------------------------------------------------------------- themes

interface Theme {
  /** Taller props along the step's side strips. */
  readonly tall: readonly Prop[];
  /** Small props scattered across the step. */
  readonly small: readonly Prop[];
  /** Ground patch colours laid flat on the step top. */
  readonly patches: readonly number[];
  /** Rocks that stick out of the step's front riser. */
  readonly outcrop: readonly number[];
  /** Details on the riser face: vines, icicles, crystals, lava streaks. */
  readonly riser?: Prop;
  /** Props floating above the step, for the sky biomes. */
  readonly floating?: readonly Prop[];
}

const GREY = [0x8f969e, 0x7a8189, 0xa3a9b0];

const vine: Prop = (r) => [box(0.25, 2 + r() * 3, 0.2, 0, -3, 0, 0x2f8a3a)];
const icicle: Prop = (r) => [box(0.35, 1 + r() * 1.5, 0.35, 0, -2, 0, 0xdff4ff, { glow: true })];
const lavaStreak: Prop = (r) => [box(0.4, 2 + r() * 4, 0.15, 0, -5, 0, 0xff6a1f, { glow: true })];
const wallCrystal = (c: number): Prop => (r) => [box(0.5, 1.4 + r(), 0.5, 0, -2, 0, c, { rz: (r() - 0.5) * 0.8, glow: true })];

const THEMES: readonly Theme[] = [
  // 1 Grassland
  { tall: [roundTree([0x4fc34a, 0x3fae3a]), bush([0x3fae3a, 0x5cd65c])], small: [tuft([0x3fae3a, 0x5cd65c]), flower([0xff5f9a, 0xffe14d, 0xffffff, 0x9d7aff]), pebbles(GREY), rock(GREY)], patches: [0x5cd65c, 0x3cb548, 0x8ce06a], outcrop: GREY, riser: vine },
  // 2 Forest
  { tall: [pine([0x1f7a34, 0x2a8a3f]), roundTree([0x2a7a2a, 0x3b8a2f], 0x5c3a1e), log], small: [bush([0x2a7a2a, 0x1f6a2a]), mushroom, rock(GREY), tuft([0x2f8a3a])], patches: [0x6b4a2a, 0x3b7a2f, 0x245f28], outcrop: [0x6b5a4a, 0x5a4a3a], riser: vine },
  // 3 Ocean
  { tall: [palm, coral([0xff6fa3, 0xff9a4d, 0xb86bff])], small: [shell, starfish, coral([0xff6fa3, 0x4fd6c8]), rock([0x6b8fa3, 0x8fb3c8]), tuft([0x2fb38a])], patches: [0x3aa8ff, 0xf2dc9a, 0x5fc8ff], outcrop: [0x4f7a9a, 0x6b8fa3] },
  // 4 Crystal
  { tall: [crystal([0xb86bff, 0x6be6ff, 0xff6be0], 1.4)], small: [crystal([0xb86bff, 0x6be6ff], 0.5), rock([0x5a4f78, 0x6b5f8a]), pebbles([0xd6c8ff, 0x7a6ba0])], patches: [0x7a4fc0, 0x9d6bec, 0x5a3a9a], outcrop: [0x4b4064, 0x5a4f78], riser: wallCrystal(0xc58cff) },
  // 5 Desert
  { tall: [cactus, mesa], small: [dune, bones, rock([0xc9784a, 0xb5663c]), cactus], patches: [0xf0cf86, 0xe0b86a, 0xf7dda0], outcrop: [0xc9784a, 0xa85a34] },
  // 6 High Mountain
  { tall: [spire(0x7f8892, 0xf4f8ff), pine([0x2a6a3a])], small: [rock(GREY), snowPile, tuft([0x6a8a4a])], patches: [0xdfe6ef, 0x9aa3ad, 0xf4f8ff], outcrop: GREY, riser: icicle },
  // 7 Snow Peak
  { tall: [pine([0x2a6a4a, 0x1f5a3a], true), crystal([0xbfe8ff, 0x9fd8ff], 1.1)], small: [snowman, snowPile, rock([0xc9dcf2, 0xa9c1dc])], patches: [0xffffff, 0xd8e8f8, 0xbfe0ff], outcrop: [0xa9c1dc, 0xdfeaf8], riser: icicle },
  // 8 Volcano
  { tall: [vent, spire(0x2a1d1a, 0xff6a1f)], small: [lavaRock, rock([0x2a2426, 0x3a2f2c]), pebbles([0x4a3a36, 0xff8a3a])], patches: [0xff5a1f, 0x3a2a26, 0x1a1414], outcrop: [0x2a1d1a, 0x3a2a26], riser: lavaStreak },
  // 9 Cloud Kingdom
  { tall: [column, cloudPuff()], small: [cloudPuff(0xf2f7ff), star(0xffd23d), pebbles([0xffffff, 0xe8f2ff])], patches: [0xe8f2ff, 0xffe9a8, 0xffffff], outcrop: [0xdfeaf8, 0xffffff], floating: [cloudPuff(), star(0xffd23d)] },
  // 10 Aurora Sky
  { tall: [crystal([0x57e0c0, 0xff6be0, 0x6b8cff], 1.3), pine([0x1a3a4a], true)], small: [crystal([0x57e0c0, 0xff9ecf], 0.5), snowPile, rock([0x3b2a78, 0x4a3a8a])], patches: [0x57e0c0, 0x3b2a78, 0x6b5bd6], outcrop: [0x3b2a78, 0x2a1f5a], riser: wallCrystal(0x57e0c0), floating: [star(0x57e0c0), star(0xff6be0)] },
  // 11 Candy Heaven
  { tall: [lollipop, candyCane], small: [gumdrop, cupcake, pebbles([0xff9ecf, 0xb8e8ff, 0xfff0c9])], patches: [0xffd1e8, 0xb8e8ff, 0xfff0c9], outcrop: [0xffb8dc, 0xff9ecf], floating: [cloudPuff(0xffe0f0), star(0xff4fa3)] },
  // 12 Stratosphere
  { tall: [balloon, antenna], small: [cloudPuff(0xe8f2ff), rock([0x5574e6, 0x6b8cff]), flag], patches: [0x8fb0ff, 0x6b8cff, 0xc8d8ff], outcrop: [0x2b3a8a, 0x3a4fb0], floating: [cloudPuff(), balloon] },
  // 13 Outer Space
  { tall: [satellite, crystal([0x5ce1ff, 0xb26bff], 1.1)], small: [crater, rock([0x6b6f7a, 0x55596a]), flag, pebbles([0x8a8f9a])], patches: [0x3a3f52, 0x2a2f45, 0x4a4f62], outcrop: [0x2a2f45, 0x3a3f52], floating: [star(0xffffff), star(0x5ce1ff)] },
  // 14 Galaxy Core
  { tall: [orbPillar(0xff4fd0), crystal([0xb26bff, 0xffd23d, 0x5ce1ff], 1.5)], small: [star(0xffd23d), crystal([0xff4fd0], 0.6), rock([0x3a1066, 0x2a0a4a])], patches: [0x9551e6, 0x3a1066, 0xff4fd0], outcrop: [0x3a1066, 0x2a0a4a], riser: wallCrystal(0xff4fd0), floating: [star(0xffffff), orbPillar(0x5ce1ff), star(0xff4fd0)] },
];

/** Deterministic PRNG, so every client places the same scenery. */
const seeded = (seed: number): Rand => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const UNIT = new BoxGeometry(1, 1, 1);
UNIT.deleteAttribute('uv');

const MATRIX = new Matrix4();
const QUAT = new Quaternion();
const EULER = new Euler();
const POS = new Vector3();
const SCALE = new Vector3();
const COLOR = new Color();

/** Accumulates boxes for one biome and merges them. */
class Batch {
  readonly solid: BufferGeometry[] = [];
  readonly glow: BufferGeometry[] = [];

  add(part: Part, ox: number, oy: number, oz: number, spin: number): void {
    const geometry = UNIT.clone();
    // Rotate the part's offset by the prop's spin so the prop turns as one.
    const cos = Math.cos(spin);
    const sin = Math.sin(spin);
    POS.set(ox + part.x * cos + part.z * sin, oy + part.y, oz - part.x * sin + part.z * cos);
    EULER.set(part.rx ?? 0, (part.ry ?? 0) + spin, part.rz ?? 0);
    QUAT.setFromEuler(EULER);
    SCALE.set(part.w, part.h, part.d);
    MATRIX.compose(POS, QUAT, SCALE);
    geometry.applyMatrix4(MATRIX);

    COLOR.setHex(part.c);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = COLOR.r;
      colors[i * 3 + 1] = COLOR.g;
      colors[i * 3 + 2] = COLOR.b;
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    (part.glow ? this.glow : this.solid).push(geometry);
  }

  prop(prop: Prop, r: Rand, x: number, y: number, z: number): void {
    const spin = r() * Math.PI * 2;
    for (const part of prop(r)) this.add(part, x, y, z, spin);
  }
}

export class BiomeDecor {
  readonly root = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly solidMaterial = new MeshLambertMaterial({ vertexColors: true });
  private readonly glowMaterial = new MeshBasicMaterial({ vertexColors: true });

  constructor() {
    for (const biome of BIOMES) {
      const theme = THEMES[biome.index - 1];
      if (!theme) continue;
      const batch = new Batch();
      for (const step of STEPS) {
        if (step.biome === biome.index) this.decorateStep(batch, theme, step);
      }
      this.flush(batch);
    }
  }

  private decorateStep(batch: Batch, theme: Theme, step: StepDefinition): void {
    const r = seeded(step.index * 7919 + 17);
    const pad = step.step === WIN_PAD_STEP ? WIN_PADS[step.biome - 1] : undefined;
    const clearOfPad = (x: number, z: number, margin: number): boolean =>
      !pad || x < pad.minX - margin || x > pad.maxX + margin || z < pad.minZ - margin || z > pad.maxZ + margin;
    const top = step.top;
    const depth = step.maxZ - step.minZ;

    // Tall props hug the side strips, so the middle stays open to run and jump.
    const tallCount = 7 + Math.floor(r() * 4);
    for (let i = 0; i < tallCount; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * ((step.maxX - step.minX) / 2 - 2.5 - r() * 5);
      const z = step.minZ + 2.5 + r() * (depth - 5);
      if (clearOfPad(x, z, 3) && !blocksBiomeSign(x, 2.5, top, top + 12, z)) batch.prop(pick(r, theme.tall), r, x, top, z);
    }

    // Small props in clusters, anywhere except directly on the pad. Clusters
    // read as a patch of flowers or a scatter of rocks rather than confetti.
    for (let cluster = 0; cluster < 9; cluster += 1) {
      const cx = step.minX + 3 + r() * (step.maxX - step.minX - 6);
      const cz = step.minZ + 2.5 + r() * (depth - 5);
      const prop = pick(r, theme.small);
      const count = 2 + Math.floor(r() * 3);
      for (let i = 0; i < count; i += 1) {
        const x = cx + (r() - 0.5) * 5;
        const z = Math.min(step.maxZ - 1, Math.max(step.minZ + 1, cz + (r() - 0.5) * 4));
        if (clearOfPad(x, z, 1) && !blocksBiomeSign(x, 1.5, top, top + 4, z)) batch.prop(i === 0 ? prop : pick(r, theme.small), r, x, top, z);
      }
    }

    // Flat ground patches, a hair above the studs.
    for (let i = 0; i < 3; i += 1) {
      const w = 4 + r() * 8;
      const d = 3 + r() * 6;
      const x = step.minX + w / 2 + 1 + r() * (step.maxX - step.minX - w - 2);
      const z = step.minZ + d / 2 + 1 + r() * (depth - d - 2);
      if (!clearOfPad(x, z, Math.max(w, d) / 2)) continue;
      batch.add({ w, h: 0.08, d, x: 0, y: 0.06, z: 0, c: pick(r, theme.patches) }, x, top, z, r() * 0.4 - 0.2);
    }

    // Rocks and details on the riser the player jumps up.
    const riserBottom = Math.max(step.bottom + 2, top - Math.min(step.top - step.bottom, 60));
    for (let i = 0; i < 5; i += 1) {
      const x = step.minX + 3 + r() * (step.maxX - step.minX - 6);
      const y = riserBottom + r() * (top - 1.5 - riserBottom);
      const s = 1 + r() * 1.8;
      if (blocksBiomeSign(x, 1.1 * s, y - 0.8 * s, y + 0.8 * s, step.minZ - 0.5)) continue;
      batch.add({ w: 2.2 * s, h: 1.6 * s, d: 1.2, x: 0, y: 0, z: 0, c: pick(r, theme.outcrop) }, x, y, step.minZ - 0.5, 0);
    }
    if (theme.riser) {
      for (let i = 0; i < 6; i += 1) {
        const x = step.minX + 2 + r() * (step.maxX - step.minX - 4);
        const parts = theme.riser(r);
        if (blocksBiomeSign(x, 0.5, top - 4, top, step.minZ - 0.25)) continue;
        for (const part of parts) batch.add({ ...part, y: part.y }, x, top - 0.5, step.minZ - 0.25, 0);
      }
    }

    // Floating scenery for the sky biomes, well off the jumping line.
    if (theme.floating) {
      for (let i = 0; i < 3; i += 1) {
        const side = r() < 0.5 ? -1 : 1;
        const x = side * ((step.maxX - step.minX) / 2 + 4 + r() * 10);
        const z = step.minZ + r() * depth;
        batch.prop(pick(r, theme.floating), r, x, top + 4 + r() * 14, z);
      }
    }
  }

  private flush(batch: Batch): void {
    const layers: [BufferGeometry[], MeshLambertMaterial | MeshBasicMaterial][] = [
      [batch.solid, this.solidMaterial],
      [batch.glow, this.glowMaterial],
    ];
    for (const [parts, material] of layers) {
      if (parts.length === 0) continue;
      const merged = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      this.geometries.push(merged);
      const mesh = new Mesh(merged, material);
      this.root.add(mesh);
    }
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.solidMaterial.dispose();
    this.glowMaterial.dispose();
    this.root.removeFromParent();
  }
}

/** Merge a batch into (at most) one lit and one glowing geometry, disposing the parts. */
export const mergeBatch = (batch: Batch): { solid: BufferGeometry | null; glow: BufferGeometry | null } => {
  const merge = (parts: BufferGeometry[]): BufferGeometry | null => {
    if (parts.length === 0) return null;
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    merged?.computeBoundingSphere();
    return merged;
  };
  return { solid: merge(batch.solid), glow: merge(batch.glow) };
};

// The prop kit, shared with the hub's scenery.
export { Batch, box, bush, cloudPuff, flower, pebbles, rock, roundTree, seeded, star, tuft };
export type { Part, Prop, Rand };
