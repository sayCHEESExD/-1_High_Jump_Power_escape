import { Group, Object3D } from 'three';
import type { AnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator, type AnimationState } from '../animation/PlayerAnimator.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { AuraEffect } from './AuraEffect.js';
import { playerModelLoader } from './PlayerModelLoader.js';
import { SPRING_LIFT, SpringBoots } from './SpringBoots.js';
import { TrailEffect } from './TrailEffect.js';

/**
 * The visual half of a player, arranged so animation can never move them.
 *
 *   root          physics transform (position + facing). Gameplay owns it.
 *     lift        raises the body onto the spring boots while they are worn
 *       tipPivot  hip-height pivot
 *         flipPivot  the backflip rotation, about the centre of mass
 *           visual   the bob and scale effects
 *             model  the cloned FBX, posed by the rig; the boots hang off its legs
 *     aura        follows the character
 *   worldRoot     the trail, which lives in world space
 */
export class PlayerCharacter {
  readonly root = new Group();
  readonly worldRoot = new Group();
  readonly animator: PlayerAnimator;
  readonly aura = new AuraEffect();
  readonly trail = new TrailEffect();
  readonly boots: SpringBoots;

  private readonly lift = new Group();
  private readonly tipPivot = new Group();
  private readonly flipPivot = new Group();
  private readonly visual = new Group();
  private readonly model: Object3D;

  constructor() {
    this.model = playerModelLoader.createInstance();
    this.root.add(this.lift);
    this.lift.add(this.tipPivot);
    this.tipPivot.add(this.flipPivot);
    this.flipPivot.add(this.visual);
    this.visual.add(this.model);
    const rig = new PlayerRig(this.model, this.model);
    this.animator = new PlayerAnimator(rig, this.tipPivot, this.flipPivot, this.visual);
    this.boots = new SpringBoots([rig.getBone('LegL2'), rig.getBone('LegR2')]);
    this.root.add(this.aura.root);
    this.worldRoot.add(this.trail.root);
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  setVisualScale(x: number, y: number, z: number): void {
    this.visual.scale.set(x, y, z);
  }

  setCosmetics(trailSlot: number, auraSlot: number): void {
    this.trail.setSlot(trailSlot);
    this.aura.setSlot(auraSlot);
  }

  /** Wear the given boot tier (0 for none) and stand the body on its springs. */
  setBoots(slot: number): void {
    this.boots.setSlot(slot);
    this.lift.position.y = this.boots.worn ? SPRING_LIFT : 0;
  }

  update(delta: number, input: AnimationInput): void {
    this.animator.update(delta, input);
  }

  updateEffects(delta: number, speed: number): void {
    const p = this.root.position;
    this.aura.update(delta);
    this.trail.update(delta, p.x, p.y, p.z, speed);
  }

  get animationState(): AnimationState {
    return this.animator.currentState;
  }

  resetAnimation(): void {
    this.animator.reset();
    this.visual.scale.set(1, 1, 1);
    this.trail.clear();
  }

  dispose(): void {
    this.boots.dispose();
    this.aura.dispose();
    this.trail.dispose();
    this.root.removeFromParent();
    this.worldRoot.removeFromParent();
  }
}
