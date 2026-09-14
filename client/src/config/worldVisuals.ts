/**
 * Colours and look for the world. Presentation only - nothing here changes
 * gameplay, and every gameplay number lives in `shared/`.
 */
export const PALETTE = {
  sky: 0x7cc8ff,
  fog: 0xbfe6ff,
  cloud: 0xffffff,
  cloudShade: 0xdcecf8,
  hubFloor: '#4f8cff',
  hubFloorLine: '#3b74e0',
  hubWall: 0x8fa3b8,
  hubWallTop: 0x39c24a,
  grass: '#39c24a',
  grassLine: '#2ea83d',
  padGold: '#ffc933',
  padGoldLine: '#e0a412',
  bootPad: 0xe23b3b,
  bootPadOwned: 0x39c24a,
  treadmillFrame: 0x3b4a78,
  treadmillFrameDark: 0x222a44,
  treadmillScreen: 0x0b1020,
  boardFrame: 0x8fa3b8,
  boardFrameDark: 0x6b7f96,
  boardPanel: '#1b2433',
  boardPanelEdge: '#0e141e',
  boardHeading: '#ffffff',
  boardStripe: 'rgba(255,255,255,0.05)',
  boardInk: '#0b1018',
  boardName: '#ffffff',
  boardValue: '#9fe8ff',
  stallAwningA: 0x3a8bff,
  stallAwningB: 0xf5f7fb,
  stallWood: 0x8a5a2b,
} as const;

/** Distance fog. The staircase is thousands of units long, so it starts far out. */
export const WORLD_FOG = { near: 260, far: 1400 } as const;

/** One look per biome: studded top colour, stud line, cliff colour, side walls. */
export interface BiomeLook {
  readonly top: string;
  readonly line: string;
  readonly cliff: number;
  readonly wall: number;
}

export const BIOME_LOOKS: readonly BiomeLook[] = [
  { top: '#4fd05a', line: '#3cb548', cliff: 0x8a5a33, wall: 0x39c24a },
  { top: '#2f9e44', line: '#237f35', cliff: 0x5f3b1f, wall: 0x1f7a34 },
  { top: '#3aa8ff', line: '#2a8ad6', cliff: 0x2a5fa8, wall: 0x49b8e8 },
  { top: '#c58cff', line: '#a86bec', cliff: 0x6b3fa0, wall: 0x9d7aff },
  { top: '#f2d27a', line: '#dcb85e', cliff: 0xc79a4a, wall: 0xe8c26a },
  { top: '#9aa3ad', line: '#7f8892', cliff: 0x5c636b, wall: 0x7f8892 },
  { top: '#f4f8ff', line: '#d8e4f4', cliff: 0xa9c1dc, wall: 0xdfeaf8 },
  { top: '#3a3a3a', line: '#262626', cliff: 0xd64b1a, wall: 0x5a1f10 },
  { top: '#ffffff', line: '#e6eef8', cliff: 0xc9dcf2, wall: 0xf2f7ff },
  { top: '#57e0c0', line: '#3fc4a6', cliff: 0x3b2a78, wall: 0x6b5bd6 },
  { top: '#ff9ecf', line: '#f07db8', cliff: 0xffd1e8, wall: 0xffb8dc },
  { top: '#6b8cff', line: '#5574e6', cliff: 0x2b3a8a, wall: 0x3a4fb0 },
  { top: '#2a2f45', line: '#1c2033', cliff: 0x141726, wall: 0x2e2a55 },
  { top: '#b26bff', line: '#9551e6', cliff: 0x3a1066, wall: 0xff4fd0 },
];

export const biomeLook = (biome: number): BiomeLook =>
  BIOME_LOOKS[Math.max(0, Math.min(BIOME_LOOKS.length - 1, biome - 1))] as BiomeLook;
