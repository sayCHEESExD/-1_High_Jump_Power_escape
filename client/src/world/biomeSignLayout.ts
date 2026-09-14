import { BIOMES, STEPS } from '@highjump/shared';

/**
 * Where every biome's name board hangs, and the space scenery must keep clear
 * of, in one place: `CourseWorld` places the boards from it and `BiomeDecor` /
 * `HubDecor` leave its sightline empty.
 *
 * Every board sits at the same spot relative to its biome: on the face of the
 * biome's first riser, a fixed distance right of the jumping line (-X is the
 * player's right), pulled out in front of the riser's rocks, at a height
 * readable from the step below.
 */
export const BIOME_SIGN = {
  width: 18,
  height: 14,
  /** Centre of the board. Narrowest biome is 38 wide, so -10 keeps it on the riser everywhere. */
  x: -10,
  /** How far in front of the riser face the board hangs. */
  standoff: 1.6,
  /** Extra space kept clear around the board. */
  clearance: 1.5,
  /** How far in front of the board scenery is kept out of its sightline. */
  approach: 30,
} as const;

export interface BiomeSignRect {
  readonly biome: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const BIOME_SIGN_RECTS: readonly BiomeSignRect[] = BIOMES.flatMap((biome) => {
  const first = STEPS.find((step) => step.biome === biome.index);
  if (!first) return [];
  const previousTop = first.top - biome.rise;
  return [
    {
      biome: biome.index,
      x: BIOME_SIGN.x,
      y: previousTop + Math.min(Math.max(biome.rise * 0.45, 8), 16),
      z: first.minZ - BIOME_SIGN.standoff,
    },
  ];
});

/**
 * True when something centred at `x`/`z`, `halfWidth` wide either side and
 * spanning `minY`..`maxY`, would stand in front of (or inside) a biome board.
 */
export const blocksBiomeSign = (x: number, halfWidth: number, minY: number, maxY: number, z: number): boolean =>
  BIOME_SIGN_RECTS.some(
    (sign) =>
      Math.abs(x - sign.x) < BIOME_SIGN.width / 2 + halfWidth + BIOME_SIGN.clearance &&
      z > sign.z - BIOME_SIGN.approach &&
      z < sign.z + 2.5 &&
      maxY > sign.y - BIOME_SIGN.height / 2 - BIOME_SIGN.clearance &&
      minY < sign.y + BIOME_SIGN.height / 2 + BIOME_SIGN.clearance,
  );
