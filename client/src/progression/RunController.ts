import { bootBySlot, bootPadAt, inShopZone, isBootOwned, winPadAt, type WorldCollision } from '@highjump/shared';
import type { LocalPlayer } from '../player/LocalPlayer.js';

const REQUEST_COOLDOWN = 0.4;

export interface RunActions {
  claimWin(biome: number): void;
  buyBoot(slot: number): void;
  enterShop(): void;
  leaveShop(): void;
}

/**
 * Turns the player's position into REQUESTS.
 *
 * It notices a win pad, a boot pedestal or the shop zone underfoot and asks the
 * server, which re-checks everything against the position IT simulated. The
 * one prediction here is a fall: the fall-over starts on the frame it is seen,
 * and the server confirms it with a Respawn.
 */
export class RunController {
  private winCooldown = 0;
  private bootCooldown = 0;
  private ownedBoots = 0;
  private wins = 0;
  private inShop = false;

  constructor(private readonly collision: WorldCollision, private readonly actions: RunActions) {}

  setInventory(ownedBoots: number, wins: number): void {
    this.ownedBoots = ownedBoots;
    this.wins = wins;
  }

  update(delta: number, player: LocalPlayer): void {
    this.winCooldown = Math.max(0, this.winCooldown - delta);
    this.bootCooldown = Math.max(0, this.bootCooldown - delta);
    if (player.isReturning) return;

    const { x, y, z } = player.position;
    // Missing a jump does nothing special: the player lands in the pit under the
    // gap and climbs out. Only a glitch outside the world waits for a placement.
    if (this.collision.isOutOfWorld(y)) {
      player.beginFallReturn();
      this.setShop(false);
      return;
    }

    if (player.isGrounded && this.winCooldown === 0) {
      const biome = winPadAt(x, y, z);
      if (biome > 0) {
        this.winCooldown = REQUEST_COOLDOWN;
        this.actions.claimWin(biome);
      }
    }

    if (this.bootCooldown === 0) {
      const slot = bootPadAt(x, y, z);
      const tier = slot > 0 ? bootBySlot(slot) : undefined;
      if (tier && !isBootOwned(this.ownedBoots, slot) && this.wins >= tier.cost) {
        this.bootCooldown = REQUEST_COOLDOWN;
        this.actions.buyBoot(slot);
      }
    }

    this.setShop(inShopZone(x, y, z));
  }

  get atShop(): boolean {
    return this.inShop;
  }

  private setShop(inside: boolean): void {
    if (inside === this.inShop) return;
    this.inShop = inside;
    if (inside) this.actions.enterShop();
    else this.actions.leaveShop();
  }
}
