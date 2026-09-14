import { rebirthCostMultiplier } from './rebirth.js';

/**
 * Energy, levels and jump height.
 *
 * ENERGY is farmed by running and jumping (distance the SERVER observes, plus a
 * bonus per jump) and is SPENT to level up: whenever the banked energy covers
 * the next level's cost, the server takes it and grants the level. Each level
 * adds jump HEIGHT.
 *
 * Everything the client shows here is replicated server state. The client
 * never awards energy or levels.
 */
export const ENERGY = {
  /** World units of travel that count as one step. */
  strideDistance: 2.5,
  /** Steps' worth of energy granted for every jump, air jumps included. */
  jumpBonusSteps: 2,
  /** Anti-teleport slack on the per-step distance the server will credit. */
  creditSlack: 1.6,
  /**
   * Level cost is
   * `(costPerLevel * L + costPivotEnergy * (L / costPivotLevel) ^ costExponent) * rebirthCostMultiplier`.
   *
   * The linear term keeps the first levels from flashing past; the steep power
   * term takes over in the 20s and makes later levels a real grind. Tuned to the
   * reference: level 22 = 1.98K, 23 = 2.4K, 24 = 2.9K, 25 = 3.5K at rebirth 0.
   */
  costPerLevel: 30,
  costPivotLevel: 22,
  costPivotEnergy: 1320,
  costExponent: 5.74,
  /** Energy per step with no boots at all. */
  baseEnergyPerStep: 1,
} as const;

/** Height tuning: total height = base + perLevel * level. Level 15 = 36. */
export const HEIGHT = {
  base: 6,
  perLevel: 2,
} as const;

/**
 * The largest Wins figure the server will hold.
 *
 * Wins are a `float64` on the wire - trail and aura prices run to the
 * trillions, far past a uint32 - so the ceiling is the largest integer a
 * double represents exactly. Every addition saturates at it.
 */
export const MAX_WINS = Number.MAX_SAFE_INTEGER;

/** Hard ceiling on levels processed by one credit, so a bug cannot hang a tick. */
const MAX_LEVELS_PER_CREDIT = 5000;

/** Base jump height from level alone, before equipment. */
export const levelHeight = (level: number): number =>
  HEIGHT.base + HEIGHT.perLevel * Math.max(1, Math.floor(level));

/** Energy needed to go from `level` to the next one. */
export const energyForNextLevel = (level: number, rebirths: number): number => {
  const at = Math.max(1, Math.floor(level));
  const base =
    ENERGY.costPerLevel * at +
    ENERGY.costPivotEnergy * (at / ENERGY.costPivotLevel) ** ENERGY.costExponent;
  return Math.max(1, Math.round(base * rebirthCostMultiplier(rebirths)));
};

export interface LevelState {
  readonly level: number;
  readonly energy: number;
  readonly levelsGained: number;
}

/**
 * Spend banked energy on as many levels as it covers.
 *
 * THE single place levels are bought. The server calls it after every credit;
 * nothing else changes a level except a rebirth resetting it.
 */
export const spendEnergy = (level: number, energy: number, rebirths: number): LevelState => {
  let at = Math.max(1, Math.floor(level));
  let banked = Number.isFinite(energy) ? Math.max(0, energy) : 0;
  let gained = 0;
  while (gained < MAX_LEVELS_PER_CREDIT) {
    const cost = energyForNextLevel(at, rebirths);
    if (banked < cost) break;
    banked -= cost;
    at += 1;
    gained += 1;
  }
  return { level: at, energy: banked, levelsGained: gained };
};

/** Total jump height after the equipment bonus, in world units. */
export const resolveHeight = (level: number, equipmentBonusPercent: number): number => {
  const bonus = Number.isFinite(equipmentBonusPercent) ? Math.max(0, equipmentBonusPercent) : 0;
  return levelHeight(level) * (1 + bonus / 100);
};

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'] as const;

/** Compact display form: 940, 1.5K, 12K, 3.1M, 800B, 1T. */
export const formatNumber = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (amount < 1000) return Math.floor(amount).toString();
  let tier = 0;
  let scaled = amount;
  while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
    scaled /= 1000;
    tier += 1;
  }
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const text = scaled.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  return `${text}${SUFFIXES[tier] ?? ''}`;
};

/** "157H 42M" for the Time board. */
export const formatDuration = (seconds: number): string => {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours}H ${minutes}M` : `${minutes}M`;
};
