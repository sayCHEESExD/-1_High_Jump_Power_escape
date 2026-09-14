import {
  auraBySlot,
  auraMask,
  isAuraOwned,
  isTrailOwned,
  trailBySlot,
  trailMask,
} from '@highjump/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { EnergyService } from './EnergyService.js';
import { wallet } from './Wallet.js';

/** How one cosmetic ladder maps onto player state. */
interface CosmeticBinding {
  cost(slot: number): number | null;
  owns(player: PlayerState, slot: number): boolean;
  grant(player: PlayerState, slot: number): void;
  equip(player: PlayerState, slot: number): void;
}

export const TRAIL_BINDING: CosmeticBinding = {
  cost: (slot) => trailBySlot(slot)?.cost ?? null,
  owns: (player, slot) => isTrailOwned(player.ownedTrails, slot),
  grant: (player, slot) => {
    player.ownedTrails |= trailMask(slot);
  },
  equip: (player, slot) => {
    player.trailSlot = slot;
  },
};

export const AURA_BINDING: CosmeticBinding = {
  cost: (slot) => auraBySlot(slot)?.cost ?? null,
  owns: (player, slot) => isAuraOwned(player.ownedAuras, slot),
  grant: (player, slot) => {
    player.ownedAuras |= auraMask(slot);
  },
  equip: (player, slot) => {
    player.auraSlot = slot;
  },
};

/**
 * Trails and auras share ONE buy-and-equip transaction, parameterised by a
 * binding. What each multiplier DOES is decided elsewhere (energy rate and win
 * reward), never here.
 */
export class CosmeticService {
  constructor(private readonly binding: CosmeticBinding) {}

  /** Buy and wear. Returns true on a purchase. */
  buy(player: PlayerState, slot: number, energy: EnergyService): boolean {
    const at = Math.floor(slot);
    const cost = this.binding.cost(at);
    if (cost === null || this.binding.owns(player, at)) return false;
    if (!wallet.spend(player, cost)) return false;
    this.binding.grant(player, at);
    this.binding.equip(player, at);
    energy.syncDerived(player);
    return true;
  }

  /** Wear an owned slot, or 0 to take it off. */
  equip(player: PlayerState, slot: number, energy: EnergyService): boolean {
    const at = Math.floor(slot);
    if (at !== 0 && (this.binding.cost(at) === null || !this.binding.owns(player, at))) return false;
    this.binding.equip(player, at);
    energy.syncDerived(player);
    return true;
  }
}
