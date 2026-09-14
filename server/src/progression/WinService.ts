import { biomeByIndex, resolveWinReward, winPadAt } from '@highjump/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { wallet } from './Wallet.js';

/** Milliseconds between two paid wins for one player. Spam protection only. */
const WIN_COOLDOWN_MS = 1500;

export type WinRefusal = 'unknown-biome' | 'not-on-pad' | 'cooldown';

export interface WinResult {
  readonly granted: boolean;
  readonly wins: number;
  readonly reason?: WinRefusal;
}

/**
 * Server authority over win pads. Wins are EARNED in exactly one place: here.
 *
 * A claim is validated against the position the SERVER simulated. A paid claim
 * sends the player back to spawn, which is what makes a second payment
 * impossible - they are hundreds of units from the pad before another request
 * could arrive. The cooldown only stops a burst of requests in one tick.
 */
export class WinService {
  private readonly lastWin = new Map<string, number>();

  forget(sessionId: string): void {
    this.lastWin.delete(sessionId);
  }

  claim(player: PlayerState, biomeIndex: number, nowMs: number): WinResult {
    const biome = biomeByIndex(biomeIndex);
    if (!biome || biome.index !== Math.floor(biomeIndex)) {
      return { granted: false, wins: 0, reason: 'unknown-biome' };
    }
    if (winPadAt(player.x, player.y, player.z) !== biome.index) {
      return { granted: false, wins: 0, reason: 'not-on-pad' };
    }
    const last = this.lastWin.get(player.sessionId) ?? -Infinity;
    if (nowMs - last < WIN_COOLDOWN_MS) return { granted: false, wins: 0, reason: 'cooldown' };

    this.lastWin.set(player.sessionId, nowMs);
    const paid = wallet.add(player, resolveWinReward(biome.wins, player.auraSlot, player.ownedAuras));
    return { granted: true, wins: paid };
  }
}
