import { ENERGY } from './progression.js';

/**
 * Spring boots: the energy-per-step ladder sold in the Win Shop.
 *
 * Bought by WALKING ONTO the boot's pedestal while holding the Wins. Wins are
 * spent, and the best boot owned is always the one worn, so buying a cheaper
 * boot later can never downgrade anybody.
 *
 * Pure data. Change a price or a bonus here and the pedestal sign, the server
 * and the verification script all follow.
 */
export interface BootTier {
  /** 1-based slot. Also the bit in the owned mask and the pedestal's place. */
  readonly slot: number;
  readonly name: string;
  /** Energy granted per step while worn. */
  readonly energyPerStep: number;
  /** Wins deducted on purchase. */
  readonly cost: number;
  /** Presentation colour. */
  readonly color: number;
}

export const BOOT_TIERS: readonly BootTier[] = [
  { slot: 1, name: 'Spring Boots', energyPerStep: 3, cost: 3, color: 0x3aa8ff },
  { slot: 2, name: 'Bounce Boots', energyPerStep: 6, cost: 10, color: 0x8b5cf6 },
  { slot: 3, name: 'Coil Boots', energyPerStep: 12, cost: 40, color: 0xd9f23a },
  { slot: 4, name: 'Rocket Boots', energyPerStep: 25, cost: 150, color: 0x3b4252 },
  { slot: 5, name: 'Turbo Boots', energyPerStep: 50, cost: 600, color: 0xffd23d },
  { slot: 6, name: 'Thunder Boots', energyPerStep: 100, cost: 2_500, color: 0x5ce1ff },
  { slot: 7, name: 'Magma Boots', energyPerStep: 220, cost: 12_000, color: 0xe23b3b },
  { slot: 8, name: 'Frost Boots', energyPerStep: 480, cost: 60_000, color: 0xbfe8ff },
  { slot: 9, name: 'Cosmic Boots', energyPerStep: 1_000, cost: 350_000, color: 0x7b5bff },
  { slot: 10, name: 'Galaxy Boots', energyPerStep: 2_200, cost: 2_500_000, color: 0xff4fd0 },
];

/** Nothing bought yet. */
export const NO_BOOTS = 0;

export const bootBySlot = (slot: number): BootTier | undefined =>
  BOOT_TIERS.find((tier) => tier.slot === Math.floor(slot));

export const bootMask = (slot: number): number => 1 << (Math.floor(slot) - 1);

export const isBootOwned = (owned: number, slot: number): boolean =>
  slot >= 1 && slot <= 16 && (owned & bootMask(slot)) !== 0;

/** The best boot in an owned mask, or null when none is owned. */
export const bestOwnedBoot = (owned: number): BootTier | null => {
  let best: BootTier | null = null;
  for (const tier of BOOT_TIERS) {
    if (isBootOwned(owned, tier.slot) && (!best || tier.energyPerStep > best.energyPerStep)) {
      best = tier;
    }
  }
  return best;
};

/** Energy per step for an owned mask. Barefoot is `ENERGY.baseEnergyPerStep`. */
export const energyPerStepFor = (owned: number): number =>
  bestOwnedBoot(owned)?.energyPerStep ?? ENERGY.baseEnergyPerStep;
