/**
 * Rebirth: the prestige ladder.
 *
 * A rebirth resets the level (and the energy banked toward the next one) and
 * in exchange grants more JUMPS. It also raises the ENERGY COST multiplier -
 * each level after a rebirth costs more energy - which is what keeps a reborn
 * player with three jumps from simply replaying the same climb three times as
 * high for free.
 *
 * Wins, boots, trails, auras and equipment are permanent and survive.
 *
 * Every number is here so the ladder is re-tuned by editing a table.
 */
export const REBIRTH = {
  /** Energy cost multiplier at rebirth 0. */
  baseCostMultiplier: 1,
  /** Added to the energy cost multiplier per rebirth: x1, x1.5, x2, x2.5 ... */
  costMultiplierPerRebirth: 0.5,
  /** Jumps at rebirth 0. */
  baseJumps: 1,
  /** One extra jump every N rebirths, starting at rebirth 1: 1,2,2,3,3,4 ... */
  rebirthsPerExtraJump: 2,
  /** Level the first rebirths need. */
  baseRequiredLevel: 25,
  /** Rebirths that share the base requirement before it starts to climb. */
  flatRebirths: 3,
  /** Extra levels per rebirth once past the flat head of the ladder. */
  levelsPerRebirth: 5,
} as const;

const count = (rebirths: number): number =>
  Number.isFinite(rebirths) ? Math.max(0, Math.floor(rebirths)) : 0;

/** Energy cost multiplier for levelling at this rebirth count. */
export const rebirthCostMultiplier = (rebirths: number): number =>
  REBIRTH.baseCostMultiplier + count(rebirths) * REBIRTH.costMultiplierPerRebirth;

/**
 * Jumps available per airborne window.
 *
 * Rebirth 0 = 1, rebirth 1 = 2, rebirth 2 = 2, rebirth 3 = 3, and on.
 */
export const maxJumpsForRebirth = (rebirths: number): number =>
  REBIRTH.baseJumps + Math.ceil(count(rebirths) / REBIRTH.rebirthsPerExtraJump);

/** Level a player with `rebirths` must reach before their next rebirth. */
export const rebirthRequiredLevel = (rebirths: number): number => {
  const done = count(rebirths);
  const past = Math.max(0, done - (REBIRTH.flatRebirths - 1));
  return REBIRTH.baseRequiredLevel + past * REBIRTH.levelsPerRebirth;
};

export const canRebirth = (level: number, rebirths: number): boolean =>
  Math.floor(level) >= rebirthRequiredLevel(rebirths);
