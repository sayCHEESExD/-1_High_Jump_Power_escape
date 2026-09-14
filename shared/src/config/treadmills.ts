/**
 * High Training: four treadmills along the back of the hub.
 *
 * Standing on a belt runs the player on the spot and pays energy as if they
 * were running at `TRAINING.beltSpeed`, times the machine's multiplier. A
 * machine the player has not unlocked (by rebirth count) pays nothing.
 *
 * There is no treadmill message: the belt is derived from POSITION by the
 * shared simulation on both sides, and the gate is checked by the server with
 * the payment.
 */
export interface TreadmillTier {
  /** 1-based, left to right as seen from spawn. */
  readonly index: number;
  readonly name: string;
  readonly rebirthsRequired: number;
  /** Energy multiplier while running on it. */
  readonly multiplier: number;
  readonly color: number;
  readonly glow: number;
}

export const TREADMILL_TIERS: readonly TreadmillTier[] = [
  { index: 1, name: 'Beginner', rebirthsRequired: 0, multiplier: 1, color: 0x6b7280, glow: 0xe5e7eb },
  { index: 2, name: '1 Rebirth', rebirthsRequired: 1, multiplier: 1.5, color: 0xf97316, glow: 0xffb347 },
  { index: 3, name: '2 Rebirth', rebirthsRequired: 2, multiplier: 2, color: 0x22c55e, glow: 0x7dff9e },
  { index: 4, name: '4 Rebirth', rebirthsRequired: 4, multiplier: 3, color: 0xeab308, glow: 0xfff06b },
];

export const TRAINING = {
  /** Centre of the belts along Z, near the back wall. */
  centerZ: -70,
  /** Belt centres along X, one per tier. */
  xs: [33, 11, -11, -33] as readonly number[],
  /** Belt length along Z and width along X. */
  beltLength: 14,
  beltWidth: 8,
  /** Top of the deck the player stands on. Under `MOVEMENT.stepHeight`. */
  deckTop: 0.4,
  /** The speed a belt pays as, in world units per second. */
  beltSpeed: 26,
} as const;

export const treadmillByIndex = (index: number): TreadmillTier | undefined =>
  TREADMILL_TIERS.find((tier) => tier.index === Math.floor(index));

/** Energy multiplier the belt pays at, or 0 when locked for this player. */
export const treadmillRate = (index: number, rebirths: number): number => {
  const tier = treadmillByIndex(index);
  if (!tier) return 0;
  return rebirths >= tier.rebirthsRequired ? tier.multiplier : 0;
};

/** Which belt, if any, the feet are on. */
export const treadmillAt = (x: number, y: number, z: number): number => {
  if (Math.abs(y - TRAINING.deckTop) > 0.6) return 0;
  if (Math.abs(z - TRAINING.centerZ) > TRAINING.beltLength / 2 - 0.5) return 0;
  for (let i = 0; i < TRAINING.xs.length; i += 1) {
    const cx = TRAINING.xs[i] ?? 0;
    if (Math.abs(x - cx) <= TRAINING.beltWidth / 2 - 0.6) return i + 1;
  }
  return 0;
};
