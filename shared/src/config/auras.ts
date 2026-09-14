import { MAX_WINS } from './progression.js';

/**
 * Auras: bought with Wins, one worn at a time, and each MULTIPLIES WINS paid by
 * a win pad (the trophy figure on the aura menu).
 *
 * Applied in exactly one place - `resolveWinReward`, which the server's
 * `WinService` calls only after validating the pad and the position.
 */
export type AuraStyle =
  | 'nature'
  | 'flame'
  | 'crystal'
  | 'lightning'
  | 'ghost'
  | 'time'
  | 'toxic'
  | 'sakura'
  | 'blackflash'
  | 'void'
  | 'magic';

export interface AuraTier {
  readonly slot: number;
  readonly name: string;
  readonly cost: number;
  /** Win multiplier while worn. */
  readonly multiplier: number;
  readonly color: number;
  readonly accent: number;
  readonly style: AuraStyle;
}

export const AURA_TIERS: readonly AuraTier[] = [
  { slot: 1, name: 'Nature', cost: 150, multiplier: 1.25, color: 0x5cd65c, accent: 0xc8ff8a, style: 'nature' },
  { slot: 2, name: 'Burning', cost: 1_500, multiplier: 1.5, color: 0xff6a1f, accent: 0xffd23d, style: 'flame' },
  { slot: 3, name: 'Crystal', cost: 12_000, multiplier: 1.75, color: 0xa66bff, accent: 0xe0d0ff, style: 'crystal' },
  { slot: 4, name: 'Lightning', cost: 105_000, multiplier: 2, color: 0x9ee7ff, accent: 0xffffff, style: 'lightning' },
  { slot: 5, name: 'Ghost', cost: 850_000, multiplier: 3, color: 0xdfe8ff, accent: 0x8fa8c8, style: 'ghost' },
  { slot: 6, name: 'Time', cost: 12_000_000, multiplier: 5, color: 0xffd54a, accent: 0x6b4a10, style: 'time' },
  { slot: 7, name: 'Toxic', cost: 150_000_000, multiplier: 8, color: 0x5cff3a, accent: 0x2a7a10, style: 'toxic' },
  { slot: 8, name: 'Sakura', cost: 1_000_000_000, multiplier: 12, color: 0xff9ecf, accent: 0xffffff, style: 'sakura' },
  { slot: 9, name: 'Black Flash', cost: 9_500_000_000, multiplier: 20, color: 0x120a12, accent: 0xff1236, style: 'blackflash' },
  { slot: 10, name: 'Void', cost: 520_000_000_000, multiplier: 35, color: 0x1a0a33, accent: 0x9b6bff, style: 'void' },
  { slot: 11, name: 'Magic', cost: 1_000_000_000_000, multiplier: 50, color: 0xff4fd0, accent: 0x5ce1ff, style: 'magic' },
];

export const NO_AURA = 0;

export const auraBySlot = (slot: number): AuraTier | undefined =>
  AURA_TIERS.find((tier) => tier.slot === Math.floor(slot));

export const auraMask = (slot: number): number => 1 << (Math.floor(slot) - 1);

export const isAuraOwned = (owned: number, slot: number): boolean =>
  slot >= 1 && slot <= 16 && (owned & auraMask(slot)) !== 0;

export const auraMultiplier = (slot: number, owned: number): number => {
  const tier = auraBySlot(slot);
  return tier && isAuraOwned(owned, tier.slot) ? tier.multiplier : 1;
};

/** THE win reward calculation: base pad value times the worn aura, saturated. */
export const resolveWinReward = (base: number, auraSlot: number, ownedAuras: number): number => {
  const value = Number.isFinite(base) ? Math.max(0, Math.floor(base)) : 0;
  return Math.min(Math.floor(value * auraMultiplier(auraSlot, ownedAuras)), MAX_WINS);
};
