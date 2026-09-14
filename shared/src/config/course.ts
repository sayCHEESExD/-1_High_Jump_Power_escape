import { BOOT_TIERS } from './boots.js';
import { TRAINING } from './treadmills.js';
import type { Aabb } from '../types/math.js';

/**
 * The world: a walled hub, then a staircase of 14 biomes climbing into the sky.
 *
 * PURE DATA, generated from the `BIOMES` table. The renderer draws exactly
 * `COURSE_SOLIDS` and the collision model collides against exactly the same
 * array, so a platform the client draws but the server does not know about is
 * structurally impossible.
 *
 * Orientation: the staircase climbs along +Z. At spawn the player faces +Z, so
 * their LEFT is +X and their RIGHT is -X (the camera's right is -X at yaw 0).
 */

export type SolidKind = 'hubFloor' | 'hubWall' | 'step' | 'pit' | 'winPad' | 'bootPad' | 'treadmill' | 'stall';

export interface CourseSolid extends Aabb {
  readonly kind: SolidKind;
  /** Biome index for steps and pads, 0 for the hub. */
  readonly biome: number;
}

// ----------------------------------------------------------------- biomes

export interface BiomeDefinition {
  /** 1-based. */
  readonly index: number;
  readonly name: string;
  /** Staircase platforms in this biome. */
  readonly steps: number;
  /** How far each step rises above the one before it. */
  readonly rise: number;
  /** Step length along Z. */
  readonly depth: number;
  /** Step width along X. */
  readonly width: number;
  /** Open gap along Z before each step. A miss is a fall. */
  readonly gap: number;
  /** Wins the biome's pad pays, before the aura multiplier. */
  readonly wins: number;
}

/**
 * THE difficulty and reward ladder. One row per biome.
 *
 * Rise is what gates progress: a step can only be reached by a jump taller
 * than its rise (air jumps stack), and jump height comes from level, rebirth
 * jumps and equipment. Gaps appear from Crystal on; widths and depths narrow.
 */
export const BIOMES: readonly BiomeDefinition[] = [
  // Rise is the jump height a single jump needs (air jumps stack). Rough level
  // needed with ONE jump: Grassland 1, Forest 7, Ocean 14, Crystal 25 (the
  // first rebirth). From Desert on, rebirth jumps and equipment are expected:
  // Desert ~L17 with 2 jumps, Snow Peak ~L25 with 3, Galaxy Core ~L47 with 9.
  { index: 1, name: 'Grassland', steps: 3, rise: 5, depth: 26, width: 64, gap: 0, wins: 1 },
  { index: 2, name: 'Forest', steps: 3, rise: 18, depth: 26, width: 62, gap: 0, wins: 3 },
  { index: 3, name: 'Ocean', steps: 3, rise: 32, depth: 24, width: 60, gap: 2, wins: 5 },
  { index: 4, name: 'Crystal', steps: 3, rise: 52, depth: 24, width: 58, gap: 3, wins: 15 },
  { index: 5, name: 'Desert', steps: 3, rise: 80, depth: 24, width: 56, gap: 4, wins: 25 },
  { index: 6, name: 'High Mountain', steps: 3, rise: 115, depth: 22, width: 54, gap: 5, wins: 40 },
  { index: 7, name: 'Snow Peak', steps: 3, rise: 160, depth: 22, width: 52, gap: 6, wins: 100 },
  { index: 8, name: 'Volcano', steps: 3, rise: 215, depth: 22, width: 50, gap: 7, wins: 300 },
  { index: 9, name: 'Cloud Kingdom', steps: 4, rise: 285, depth: 22, width: 48, gap: 8, wins: 1_000 },
  { index: 10, name: 'Aurora Sky', steps: 4, rise: 370, depth: 22, width: 46, gap: 9, wins: 4_000 },
  { index: 11, name: 'Candy Heaven', steps: 4, rise: 470, depth: 20, width: 44, gap: 10, wins: 20_000 },
  { index: 12, name: 'Stratosphere', steps: 4, rise: 590, depth: 20, width: 42, gap: 11, wins: 120_000 },
  { index: 13, name: 'Outer Space', steps: 4, rise: 730, depth: 20, width: 40, gap: 12, wins: 800_000 },
  { index: 14, name: 'Galaxy Core', steps: 4, rise: 900, depth: 20, width: 38, gap: 12, wins: 10_000_000 },
];

/** The step (1-based, within its biome) that carries the win pad. */
export const WIN_PAD_STEP = 3;

/** Win pad footprint and its inset from the step's left (+X) edge. */
export const WIN_PAD = { width: 12, depth: 10, inset: 2, thickness: 0.3 } as const;

/** How far below its top a step column extends. */
const STEP_SKIRT = 40;

// -------------------------------------------------------------------- hub

export const HUB = {
  halfWidth: 72,
  minZ: -84,
  /** The hub's front edge, where the first step begins. */
  maxZ: 44,
  floorY: 0,
  /** Height of the hub's walls (visual; the side and back are a clamp). */
  wallHeight: 26,
} as const;

export const STAIR_START_Z = HUB.maxZ;

/** Boot pedestals: two rows of five down the player's LEFT (+X). */
export const BOOT_SHOP = {
  rowXs: [44, 58] as readonly number[],
  firstZ: -58,
  spacingZ: 13,
  padSize: 7,
  padTop: 0.35,
  perRow: 5,
} as const;

/** The equipment stall, just before the staircase on the player's RIGHT. */
export const EQUIPMENT_STALL = {
  x: -34,
  z: 34,
  /** Counter footprint (solid). */
  width: 12,
  depth: 3,
  height: 2.6,
  /** Standing in this rectangle opens the shop and allows purchases. */
  zone: { minX: -44, maxX: -24, minZ: 20, maxZ: 32.5 },
} as const;

/** The scoreboards stand against the RIGHT (-X) wall. */
export const SCOREBOARD = {
  x: -HUB.halfWidth + 1,
  zs: [-58, -26, 6] as readonly number[],
} as const;

export const bootPadCentre = (slot: number): { x: number; z: number } => {
  const index = Math.max(0, Math.floor(slot) - 1);
  const row = Math.floor(index / BOOT_SHOP.perRow);
  const column = index % BOOT_SHOP.perRow;
  return {
    x: BOOT_SHOP.rowXs[row] ?? BOOT_SHOP.rowXs[0] ?? 0,
    z: BOOT_SHOP.firstZ + column * BOOT_SHOP.spacingZ,
  };
};

// ------------------------------------------------------------- generation

export interface StepDefinition {
  /** 0-based across the whole staircase. */
  readonly index: number;
  readonly biome: number;
  /** 1-based within its biome. */
  readonly step: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly top: number;
  readonly bottom: number;
}

export interface WinPadDefinition extends Aabb {
  readonly biome: number;
  readonly wins: number;
}

const buildSteps = (): StepDefinition[] => {
  const steps: StepDefinition[] = [];
  let z = STAIR_START_Z;
  let top = HUB.floorY;
  for (const biome of BIOMES) {
    for (let s = 1; s <= biome.steps; s += 1) {
      if (steps.length > 0) z += biome.gap;
      top += biome.rise;
      steps.push({
        index: steps.length,
        biome: biome.index,
        step: s,
        minX: -biome.width / 2,
        maxX: biome.width / 2,
        minZ: z,
        maxZ: z + biome.depth,
        top,
        bottom: top - biome.rise - STEP_SKIRT,
      });
      z += biome.depth;
    }
  }
  return steps;
};

export const STEPS: readonly StepDefinition[] = buildSteps();

/**
 * How far below the step before it a gap's floor sits.
 *
 * Every gap HAS a floor. Missing a jump is never punished with a respawn: the
 * player drops into a shallow pit and jumps straight back out, onto the step
 * they came from or at the step they missed.
 */
export const PIT_DEPTH = 6;

/** Thickness of the column under a pit floor. */
const PIT_SKIRT = 20;

export interface PitDefinition {
  readonly biome: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Top of the pit floor. */
  readonly floor: number;
}

const buildPits = (): PitDefinition[] => {
  const pits: PitDefinition[] = [];
  for (let i = 1; i < STEPS.length; i += 1) {
    const before = STEPS[i - 1] as StepDefinition;
    const after = STEPS[i] as StepDefinition;
    if (after.minZ - before.maxZ <= 1e-9) continue;
    pits.push({
      biome: after.biome,
      // As wide as the step before it, which is what the side clamp uses in a gap.
      minX: before.minX,
      maxX: before.maxX,
      minZ: before.maxZ,
      maxZ: after.minZ,
      floor: before.top - PIT_DEPTH,
    });
  }
  return pits;
};

export const PITS: readonly PitDefinition[] = buildPits();

const lastStep = STEPS[STEPS.length - 1] as StepDefinition;

/** The far end of the world. */
export const COURSE_END_Z = lastStep.maxZ;

/** Top of the highest step. */
export const COURSE_TOP_Y = lastStep.top;

export const WIN_PADS: readonly WinPadDefinition[] = BIOMES.map((biome) => {
  const step = STEPS.find((s) => s.biome === biome.index && s.step === WIN_PAD_STEP);
  if (!step) throw new Error(`biome ${biome.index} has no step ${WIN_PAD_STEP}`);
  const centreZ = (step.minZ + step.maxZ) / 2;
  return {
    biome: biome.index,
    wins: biome.wins,
    maxX: step.maxX - WIN_PAD.inset,
    minX: step.maxX - WIN_PAD.inset - WIN_PAD.width,
    minZ: centreZ - WIN_PAD.depth / 2,
    maxZ: centreZ + WIN_PAD.depth / 2,
    minY: step.top,
    maxY: step.top + WIN_PAD.thickness,
  };
});

export const biomeByIndex = (index: number): BiomeDefinition | undefined =>
  BIOMES.find((biome) => biome.index === Math.floor(index));

const box = (
  kind: SolidKind,
  biome: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): CourseSolid => ({ kind, biome, minX, maxX, minY, maxY, minZ, maxZ });

const buildSolids = (): CourseSolid[] => {
  const solids: CourseSolid[] = [];
  const firstHalf = (BIOMES[0]?.width ?? 64) / 2;

  solids.push(
    box('hubFloor', 0, -HUB.halfWidth, HUB.halfWidth, HUB.floorY - 4, HUB.floorY, HUB.minZ, HUB.maxZ),
  );

  // The hub's front wall either side of the staircase mouth. SOLID, so a player
  // walking along the front of the hub is stopped rather than clamped sideways.
  const wallTop = HUB.floorY + 400;
  solids.push(
    box('hubWall', 0, firstHalf, HUB.halfWidth + 2, HUB.floorY - 4, wallTop, HUB.maxZ, HUB.maxZ + 2),
    box('hubWall', 0, -HUB.halfWidth - 2, -firstHalf, HUB.floorY - 4, wallTop, HUB.maxZ, HUB.maxZ + 2),
  );

  for (const step of STEPS) {
    solids.push(
      box('step', step.biome, step.minX, step.maxX, step.bottom, step.top, step.minZ, step.maxZ),
    );
  }

  for (const pit of PITS) {
    solids.push(box('pit', pit.biome, pit.minX, pit.maxX, pit.floor - PIT_SKIRT, pit.floor, pit.minZ, pit.maxZ));
  }

  for (const pad of WIN_PADS) {
    solids.push(box('winPad', pad.biome, pad.minX, pad.maxX, pad.minY, pad.maxY, pad.minZ, pad.maxZ));
  }

  const half = BOOT_SHOP.padSize / 2;
  for (const tier of BOOT_TIERS) {
    const c = bootPadCentre(tier.slot);
    solids.push(
      box('bootPad', 0, c.x - half, c.x + half, HUB.floorY, HUB.floorY + BOOT_SHOP.padTop, c.z - half, c.z + half),
    );
  }

  for (const x of TRAINING.xs) {
    solids.push(
      box(
        'treadmill',
        0,
        x - TRAINING.beltWidth / 2,
        x + TRAINING.beltWidth / 2,
        HUB.floorY,
        HUB.floorY + TRAINING.deckTop,
        TRAINING.centerZ - TRAINING.beltLength / 2,
        TRAINING.centerZ + TRAINING.beltLength / 2,
      ),
    );
  }

  const stall = EQUIPMENT_STALL;
  solids.push(
    box(
      'stall',
      0,
      stall.x - stall.width / 2,
      stall.x + stall.width / 2,
      HUB.floorY,
      HUB.floorY + stall.height,
      stall.z - stall.depth / 2,
      stall.z + stall.depth / 2,
    ),
  );

  return solids;
};

export const COURSE_SOLIDS: readonly CourseSolid[] = buildSolids();

// ---------------------------------------------------------------- queries

/** The last step whose front edge is at or behind `z`, or null in the hub. */
export const stepBehind = (z: number): StepDefinition | null => {
  if (z < STAIR_START_Z) return null;
  let lo = 0;
  let hi = STEPS.length - 1;
  let found: StepDefinition | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const step = STEPS[mid] as StepDefinition;
    if (step.minZ <= z) {
      found = step;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
};

/** The biome a Z position is in, 0 for the hub. */
export const biomeAt = (z: number): number => stepBehind(z)?.biome ?? 0;

/** Half the walkable width at `z`. */
export const halfWidthAt = (z: number): number => {
  const step = stepBehind(z);
  return step ? (step.maxX - step.minX) / 2 : HUB.halfWidth;
};

/** The biome whose win pad the feet are on, or 0. */
export const winPadAt = (x: number, y: number, z: number): number => {
  const step = stepBehind(z);
  if (!step || step.step !== WIN_PAD_STEP) return 0;
  const pad = WIN_PADS[step.biome - 1];
  if (!pad) return 0;
  if (x < pad.minX || x > pad.maxX || z < pad.minZ || z > pad.maxZ) return 0;
  if (y < pad.minY - 0.5 || y > pad.maxY + 1.5) return 0;
  return pad.biome;
};

/** The boot pedestal the feet are on, or 0. */
export const bootPadAt = (x: number, y: number, z: number): number => {
  if (y > HUB.floorY + BOOT_SHOP.padTop + 1 || z > STAIR_START_Z) return 0;
  const half = BOOT_SHOP.padSize / 2 - 0.3;
  for (const tier of BOOT_TIERS) {
    const c = bootPadCentre(tier.slot);
    if (Math.abs(x - c.x) <= half && Math.abs(z - c.z) <= half) return tier.slot;
  }
  return 0;
};

/** True while standing at the equipment stall. */
export const inShopZone = (x: number, y: number, z: number): boolean => {
  const zone = EQUIPMENT_STALL.zone;
  return (
    y < HUB.floorY + 2 && x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ
  );
};
