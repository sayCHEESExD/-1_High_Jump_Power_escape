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
 *             model  the cloned FBX (or a Bloxity body), posed by the rig; the boots hang off its legs
 *     aura        follows the character
 *   worldRoot     the trail, which lives in world space
 */
export class PlayerCharacter {
  readonly root = new Group();
  readonly worldRoot = new Group();
  readonly animator: PlayerAnimator;
  readonly aura = new AuraEffect();
  readonly trail = new TrailEffect();

  private readonly lift = new Group();
  private readonly tipPivot = new Group();
  private readonly flipPivot = new Group();
  private readonly visual = new Group();
  private readonly defaultModel: Object3D;
  private model: Object3D;
  private currentBoots: SpringBoots;
  private bootSlot = 0;

  constructor() {
    this.defaultModel = playerModelLoader.createInstance();
    this.model = this.defaultModel;
    this.root.add(this.lift);
    this.lift.add(this.tipPivot);
    this.tipPivot.add(this.flipPivot);
    this.flipPivot.add(this.visual);
    this.visual.add(this.model);
    const rig = new PlayerRig(this.model, this.model);
    this.animator = new PlayerAnimator(rig, this.tipPivot, this.flipPivot, this.visual);
    this.currentBoots = new SpringBoots([rig.getBone('LegL2'), rig.getBone('LegR2')]);
    this.root.add(this.aura.root);
    this.worldRoot.add(this.trail.root);
  }

  get boots(): SpringBoots {
    return this.currentBoots;
  }

  /** The body currently worn: the bundled FBX or a Bloxity body. */
  get modelRoot(): Object3D {
    return this.model;
  }

  /**
   * Wear a different body, or null for the bundled one.
   *
   * The body goes into the SAME `visual` node, so nothing above it moves, and a
   * fresh rig is bound to it by bone name - Bloxity's `player.glb` carries the
   * twelve names `player.fbx` does, so the run, jump and backflip drive it
   * unchanged. The spring boots are rebuilt on the new legs, from the bind pose
   * and before the body is parented, which is how they were placed originally.
   *
   * @returns the model now worn
   */
  setModel(next: Object3D | null): Object3D {
    const target = next ?? this.defaultModel;
    if (target === this.model) return target;

    const previous = this.model;
    previous.removeFromParent();
    if (previous !== this.defaultModel && previous.userData['bloxityBody'] === true) {
      // A Bloxity body owns its material; its part geometry is cached and shared.
      previous.traverse((child) => {
        const material = (child as { material?: { dispose?: () => void } }).material;
        material?.dispose?.();
      });
    }

    const rig = new PlayerRig(target, target);
    rig.resetToBindPose();
    target.updateMatrixWorld(true);
    this.currentBoots.dispose();
    this.currentBoots = new SpringBoots([rig.getBone('LegL2'), rig.getBone('LegR2')]);
    this.currentBoots.setSlot(this.bootSlot);

    this.model = target;
    this.visual.add(target);
    this.animator.setRig(rig);
    return target;
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
    this.bootSlot = slot;
    this.currentBoots.setSlot(slot);
    this.lift.position.y = this.currentBoots.worn ? SPRING_LIFT : 0;
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
    this.currentBoots.dispose();
    this.aura.dispose();
    this.trail.dispose();
    this.root.removeFromParent();
    this.worldRoot.removeFromParent();
  }
}
