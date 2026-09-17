import { TRAINING, bestOwnedBoot, treadmillRate } from '@highjump/shared';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import { decodeEquipped } from '../bloxity/avatarCode.js';
import { BloxityAvatar } from '../bloxity/BloxityAvatar.js';
import { DEFAULT_PROPORTIONS } from '../bloxity/legionTypes.js';
import type { NetPlayerState } from '../net/netTypes.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const FOLLOW_RATE = 14;
const SNAP_DISTANCE = 16;

const shortestAngle = (from: number, to: number): number => {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
};

/**
 * Another player, rendered from replicated state only.
 *
 * Animation is reconstructed by the same animator the local player runs. One-shot
 * edges are DERIVED from monotonic counters against a baseline taken on first
 * sight, so a stranger's lifetime of jumps is never replayed on join.
 *
 * Remotes are ghosted: they never collide with anyone.
 */
export class RemotePlayer {
  readonly character = new PlayerCharacter();

  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private targetYaw = 0;
  private readonly input: AnimationInput = createAnimationInput();

  private lastJumpCount: number;
  private lastFlipCount: number;
  private wasGrounded = true;
  private placed = false;
  /** Their Bloxity appearance, built only once they turn out to have one. */
  private avatar: BloxityAvatar | null = null;
  private avatarCode = '';

  constructor(state: NetPlayerState) {
    this.lastJumpCount = state.jumpCount;
    this.lastFlipCount = state.flipCount;
    this.apply(state);
    this.character.setPosition(this.targetX, this.targetY, this.targetZ);
    this.character.setYaw(this.targetYaw);
    this.placed = true;
  }

  apply(state: NetPlayerState): void {
    this.targetX = state.x;
    this.targetY = state.y;
    this.targetZ = state.z;
    this.targetYaw = state.rotationY;

    const running = state.treadmill > 0 && treadmillRate(state.treadmill, state.rebirths) > 0;
    this.input.grounded = state.grounded;
    this.input.horizontalSpeed = running ? TRAINING.beltSpeed : state.speed;
    this.input.verticalVelocity = state.verticalVelocity;

    const flips = state.flipCount - this.lastFlipCount;
    const jumps = state.jumpCount - this.lastJumpCount - Math.max(0, flips);
    if (flips > 0) this.input.airJumped = true;
    if (jumps > 0) this.input.jumpStarted = true;
    this.lastFlipCount = state.flipCount;
    this.lastJumpCount = state.jumpCount;

    if (!this.wasGrounded && state.grounded) this.input.landed = true;
    this.wasGrounded = state.grounded;

    this.character.setCosmetics(state.trailSlot, state.auraSlot);
    this.character.setBoots(bestOwnedBoot(state.ownedBoots)?.slot ?? 0);
    this.wearAvatar(state.avatar);
  }

  /**
   * Wear the Bloxity look the server replicated for this player.
   *
   * Proportions are not replicated, so a remote stands at Bloxity's default
   * build - the SKIN and the items are what identify somebody across a room.
   * An empty code means no Bloxity appearance, and the bundled character is
   * what a player without one is meant to look like.
   */
  private wearAvatar(code: string): void {
    if (code === this.avatarCode) return;
    this.avatarCode = code;
    if (!code) {
      this.avatar?.clear();
      return;
    }
    this.avatar ??= new BloxityAvatar(this.character);
    this.avatar.apply(decodeEquipped(code), DEFAULT_PROPORTIONS);
  }

  update(delta: number): void {
    const dt = Math.max(0, delta);
    const position = this.character.root.position;
    const gap = Math.hypot(this.targetX - position.x, this.targetY - position.y, this.targetZ - position.z);

    if (!this.placed || gap > SNAP_DISTANCE) {
      position.set(this.targetX, this.targetY, this.targetZ);
      this.character.setYaw(this.targetYaw);
      if (gap > SNAP_DISTANCE) this.character.trail.clear();
      this.placed = true;
    } else {
      const alpha = 1 - Math.exp(-FOLLOW_RATE * dt);
      position.x += (this.targetX - position.x) * alpha;
      position.y += (this.targetY - position.y) * alpha;
      position.z += (this.targetZ - position.z) * alpha;
      const yaw = this.character.root.rotation.y;
      this.character.setYaw(yaw + shortestAngle(yaw, this.targetYaw) * alpha);
    }

    this.character.update(dt, this.input);
    this.character.updateEffects(dt, this.input.horizontalSpeed);
    this.input.jumpStarted = false;
    this.input.airJumped = false;
    this.input.landed = false;
  }

  dispose(): void {
    this.avatar?.dispose();
    this.character.dispose();
  }
}
