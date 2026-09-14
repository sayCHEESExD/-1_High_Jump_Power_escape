import {
  ENERGY,
  MAX_SIM_DELTA,
  MOVEMENT,
  TRAINING,
  energyPerStepFor,
  equipmentHeightBonus,
  maxJumpsForRebirth,
  resolveHeight,
  resolveJumpPhysics,
  spendEnergy,
  trailMultiplier,
  treadmillRate,
} from '@highjump/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';

interface Tracker {
  x: number;
  z: number;
  jumpCount: number;
  /** True until the first credit, so spawning pays nothing. */
  fresh: boolean;
}

/**
 * Server authority over energy, levels and everything derived from them.
 *
 * Energy is DERIVED from movement the server observes - the distance between
 * consecutive authoritative positions, a bonus per jump the simulation counted,
 * or the belt of an unlocked treadmill - and a single step is capped at a
 * plausible distance, so a teleport pays nothing. There is no energy message.
 *
 * `syncDerived` is THE evaluator for height, jump physics, jump count and the
 * per-step rate. Every service that changes an input to those (a level, a
 * rebirth, a boot, a trail, an equipped item) calls it instead of computing
 * its own.
 */
export class EnergyService {
  private readonly trackers = new Map<string, Tracker>();

  initialise(player: PlayerState): void {
    this.syncDerived(player);
    this.reset(player.sessionId, player);
  }

  forget(sessionId: string): void {
    this.trackers.delete(sessionId);
  }

  /** Drop the movement baseline. Called on every placement. */
  reset(sessionId: string, player: PlayerState): void {
    this.trackers.set(sessionId, {
      x: player.x,
      z: player.z,
      jumpCount: player.jumpCount,
      fresh: true,
    });
  }

  /** The per-step rate: boots times the worn trail. */
  rate(player: PlayerState): number {
    return energyPerStepFor(player.ownedBoots) * trailMultiplier(player.trailSlot, player.ownedTrails);
  }

  /** Credit one simulated step. Call AFTER the transform was updated. */
  credit(sessionId: string, player: PlayerState, stepSeconds: number): number {
    const tracker = this.trackers.get(sessionId);
    if (!tracker) {
      this.reset(sessionId, player);
      return 0;
    }

    const step = Number.isFinite(stepSeconds) ? Math.max(0, Math.min(stepSeconds, MAX_SIM_DELTA)) : 0;
    const perStep = this.rate(player);
    let gained = 0;

    if (!tracker.fresh) {
      if (player.treadmill > 0) {
        // The belt supplies the distance; a locked machine pays nothing.
        const distance = TRAINING.beltSpeed * step;
        gained += (distance / ENERGY.strideDistance) * perStep * treadmillRate(player.treadmill, player.rebirths);
      } else {
        const distance = Math.hypot(player.x - tracker.x, player.z - tracker.z);
        const cap = MOVEMENT.runSpeed * step * ENERGY.creditSlack + 0.5;
        if (distance <= cap) gained += (distance / ENERGY.strideDistance) * perStep;
      }

      // Jumps the SIMULATION counted - one input produces at most one.
      const jumps = player.jumpCount - tracker.jumpCount;
      if (jumps > 0 && jumps <= 2) gained += jumps * ENERGY.jumpBonusSteps * perStep;
    }

    tracker.x = player.x;
    tracker.z = player.z;
    tracker.jumpCount = player.jumpCount;
    tracker.fresh = false;

    if (gained > 0) this.grant(player, gained);
    return gained;
  }

  /** Add energy and spend it on levels. The only path that raises a level. */
  grant(player: PlayerState, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    player.energy += amount;
    player.lifetimeEnergy += amount;
    const result = spendEnergy(player.level, player.energy, player.rebirths);
    player.energy = result.energy;
    if (result.levelsGained > 0) {
      player.level = result.level;
      this.syncDerived(player);
    }
  }

  /** Re-derive height, jump physics, jump count and the per-step rate. */
  syncDerived(player: PlayerState): void {
    player.level = Math.max(1, Math.floor(player.level));
    player.energyPerStep = this.rate(player);
    player.height = resolveHeight(player.level, equipmentHeightBonus(player.equipment));
    const physics = resolveJumpPhysics(player.height);
    player.jumpVelocity = physics.velocity;
    player.gravity = physics.gravity;
    player.maxJumps = maxJumpsForRebirth(player.rebirths);
  }
}
