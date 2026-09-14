import {
  COURSE_END_Z,
  COURSE_SOLIDS,
  HUB,
  STAIR_START_Z,
  bootPadAt,
  fallFloorAt,
  halfWidthAt,
  inShopZone,
  winPadAt,
  type CourseSolid,
} from '../config/course.js';
import { MOVEMENT } from '../config/movement.js';
import { treadmillAt } from '../config/treadmills.js';
import { BODY_HEIGHT, BODY_RADIUS, DEATH_PLANE_Y, FALL_MARGIN } from '../constants/world.js';

/**
 * The gameplay shape of the world: what you can stand on, what stops you, and
 * where the triggers are.
 *
 * Lives in `shared` because BOTH sides collide against it - the server
 * simulates movement against this object and the client predicts against an
 * identical one. Solids are bucketed by Z so a substep tests a handful of
 * boxes rather than the whole staircase.
 */

const BUCKET_SIZE = 24;

/**
 * How far below a surface the player may be and still land on it. The SAME
 * number as `MOVEMENT.stepHeight`: `surfaceYAt` offers surfaces within a step
 * of the feet and `canLandOn` must accept exactly those, or a pad a hair above
 * the floor becomes something the player falls straight through.
 */
const LANDING_TOLERANCE = MOVEMENT.stepHeight;

const CEILING_TOLERANCE = 0.05;

export interface CourseTriggers {
  fell: boolean;
  treadmill: number;
  bootPad: number;
  winPad: number;
  inShop: boolean;
}

export class WorldCollision {
  private readonly buckets = new Map<number, CourseSolid[]>();
  private readonly minBucket: number;
  private readonly maxBucket: number;

  constructor() {
    let lowest = Number.POSITIVE_INFINITY;
    let highest = Number.NEGATIVE_INFINITY;
    for (const solid of COURSE_SOLIDS) {
      const from = bucketOf(solid.minZ);
      const to = bucketOf(solid.maxZ);
      lowest = Math.min(lowest, from);
      highest = Math.max(highest, to);
      for (let b = from; b <= to; b += 1) {
        let list = this.buckets.get(b);
        if (!list) {
          list = [];
          this.buckets.set(b, list);
        }
        list.push(solid);
      }
    }
    this.minBucket = lowest;
    this.maxBucket = highest;
  }

  private near(z: number): readonly CourseSolid[] {
    const bucket = bucketOf(z);
    if (bucket < this.minBucket - 1 || bucket > this.maxBucket + 1) return EMPTY;
    SCRATCH.length = 0;
    for (let b = bucket - 1; b <= bucket + 1; b += 1) {
      const list = this.buckets.get(b);
      if (list) for (const solid of list) SCRATCH.push(solid);
    }
    return SCRATCH;
  }

  /** Height of the walkable surface under the feet, or null over a gap. */
  surfaceYAt(x: number, z: number, feetY: number): number | null {
    const ceiling = feetY + MOVEMENT.stepHeight;
    let best: number | null = null;
    for (const solid of this.near(z)) {
      if (x < solid.minX - BODY_RADIUS || x > solid.maxX + BODY_RADIUS) continue;
      if (z < solid.minZ - BODY_RADIUS || z > solid.maxZ + BODY_RADIUS) continue;
      if (solid.maxY > ceiling) continue;
      if (best === null || solid.maxY > best) best = solid.maxY;
    }
    return best;
  }

  /** Underside of the lowest solid the head is about to hit, or null. */
  ceilingYAt(x: number, z: number, previousHeadY: number): number | null {
    let best: number | null = null;
    for (const solid of this.near(z)) {
      if (x < solid.minX || x > solid.maxX) continue;
      if (z < solid.minZ || z > solid.maxZ) continue;
      if (previousHeadY > solid.minY + CEILING_TOLERANCE) continue;
      if (best === null || solid.minY < best) best = solid.minY;
    }
    return best;
  }

  canLandOn(previousY: number, surfaceY: number): boolean {
    return previousY >= surfaceY - LANDING_TOLERANCE;
  }

  /** Push the body out of anything it walked into along ONE axis. */
  resolveAxis(axis: 0 | 2, value: number, other: number, feetY: number): number {
    const headY = feetY + BODY_HEIGHT;
    const stepTop = feetY + MOVEMENT.stepHeight;
    let out = value;

    for (const solid of this.near(axis === 2 ? value : other)) {
      if (solid.maxY <= stepTop) continue;
      if (solid.minY >= headY) continue;

      const minA = axis === 0 ? solid.minX : solid.minZ;
      const maxA = axis === 0 ? solid.maxX : solid.maxZ;
      const minB = axis === 0 ? solid.minZ : solid.minX;
      const maxB = axis === 0 ? solid.maxZ : solid.maxX;

      if (other + BODY_RADIUS <= minB || other - BODY_RADIUS >= maxB) continue;
      if (out + BODY_RADIUS <= minA || out - BODY_RADIUS >= maxA) continue;

      const pushLow = minA - BODY_RADIUS;
      const pushHigh = maxA + BODY_RADIUS;
      out = out - pushLow < pushHigh - out ? pushLow : pushHigh;
    }
    return out;
  }

  /**
   * The invisible walls: the hub's sides and back, the staircase's sides, and
   * the top end. A CLAMP applied after integration, so no speed can tunnel it.
   * The hub's FRONT wall is a real solid (see `course.ts`), which is what lets
   * this clamp switch width at the staircase mouth without shoving anyone.
   */
  clampToBounds(x: number, z: number, out: { x: number; z: number }): void {
    const minZ = HUB.minZ + BODY_RADIUS;
    const maxZ = COURSE_END_Z - BODY_RADIUS;
    out.z = z < minZ ? minZ : z > maxZ ? maxZ : z;
    const limit =
      (out.z < STAIR_START_Z ? HUB.halfWidth : halfWidthAt(out.z)) - BODY_RADIUS;
    out.x = x < -limit ? -limit : x > limit ? limit : x;
  }

  /** True once the player has dropped well below where they could have stood. */
  hasFallen(y: number, z: number): boolean {
    if (y <= DEATH_PLANE_Y) return true;
    return y < fallFloorAt(z) - FALL_MARGIN;
  }

  sampleTriggers(x: number, y: number, z: number): CourseTriggers {
    return {
      fell: this.hasFallen(y, z),
      treadmill: treadmillAt(x, y, z),
      bootPad: bootPadAt(x, y, z),
      winPad: winPadAt(x, y, z),
      inShop: inShopZone(x, y, z),
    };
  }
}

const SCRATCH: CourseSolid[] = [];
const EMPTY: readonly CourseSolid[] = [];

const bucketOf = (z: number): number => Math.floor(z / BUCKET_SIZE);
