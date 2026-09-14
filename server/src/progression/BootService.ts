import { bootBySlot, bootMask, bootPadAt, isBootOwned } from '@highjump/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { EnergyService } from './EnergyService.js';
import { wallet } from './Wallet.js';

export type BootRefusal = 'unknown-boot' | 'already-owned' | 'not-on-pad' | 'too-poor';

/**
 * Server authority over the Win Shop boots.
 *
 * Buying is a deliberate act: the player must stand on the pedestal holding
 * the Wins. Every check runs before the payment, and the payment runs last.
 */
export class BootService {
  claim(player: PlayerState, slot: number, energy: EnergyService): BootRefusal | null {
    const tier = bootBySlot(slot);
    if (!tier) return 'unknown-boot';
    if (isBootOwned(player.ownedBoots, tier.slot)) return 'already-owned';
    if (bootPadAt(player.x, player.y, player.z) !== tier.slot) return 'not-on-pad';
    if (!wallet.spend(player, tier.cost)) return 'too-poor';
    player.ownedBoots |= bootMask(tier.slot);
    energy.syncDerived(player);
    return null;
  }
}
