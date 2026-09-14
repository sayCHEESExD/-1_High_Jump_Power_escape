import { canRebirth } from '@highjump/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { EnergyService } from './EnergyService.js';

/**
 * Server authority over rebirths.
 *
 * Resets level and banked energy; raises the jump count and the energy cost
 * multiplier. Wins, boots, trails, auras and equipment are untouched. The
 * client sends an empty message - eligibility is decided from server state.
 */
export class RebirthService {
  rebirth(player: PlayerState, energy: EnergyService): boolean {
    if (!canRebirth(player.level, player.rebirths)) return false;
    player.rebirths += 1;
    player.level = 1;
    player.energy = 0;
    energy.syncDerived(player);
    return true;
  }
}
