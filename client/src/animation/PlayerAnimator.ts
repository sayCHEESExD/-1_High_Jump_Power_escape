import { Group, Vector3 } from 'three';
import {
  AIRBORNE,
  BACKFLIP_ANIM,
  FLIP_PIVOT_HEIGHT,
  IDLE,
  JUMP_ANIMATION,
  JUMP_START,
  LANDING,
  LOCOMOTION,
  TIP_PIVOT_HEIGHT,
  TRANSITIONS,
} from '../config/animationConfig.js';
import type { AnimationInput } from './AnimationInput.js';
import { BackflipAnimator } from './BackflipAnimator.js';
import { LocomotionCycle } from './LocomotionCycle.js';
import { PoseBuffer } from './PoseBuffer.js';
import type { PlayerRig } from './rig/PlayerRig.js';

/** Negative rotation about the character's right axis takes the head backward. */
const FLIP_AXIS = new Vector3(1, 0, 0);

export type AnimationState = 'idle' | 'run' | 'jumpStart' | 'airborne' | 'backflip' | 'landing';

/** The states that make up "the jump", played at `JUMP_ANIMATION.playbackRate`. */
const JUMP_STATES: ReadonlySet<AnimationState> = new Set(['jumpStart', 'airborne', 'backflip', 'landing']);

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * The player animation state machine: run, jump, backflip (air jumps) and land.
 * There is no death animation - a fall simply returns the player to spawn.
 *
 * Writes ONLY to bones (via `PlayerRig`), the flip pivot and the visual bob
 * node. It never touches the physics root.
 *
 * The jump states run on a scaled clock (`JUMP_ANIMATION.playbackRate`): their
 * timers, cross-fades, flip rotation and rise/fall blend all advance slower,
 * while the physics that moves the player is unchanged.
 */
export class PlayerAnimator {
  private readonly locomotion = new LocomotionCycle();
  private readonly backflip = new BackflipAnimator();

  private readonly target = new PoseBuffer();
  private readonly from = new PoseBuffer();
  private readonly output = new PoseBuffer();

  private state: AnimationState = 'idle';
  private stateTime = 0;
  private blendTime = 0;
  private blendDuration = 0;
  private idleTime = 0;
  private wasGrounded = true;
  /** Eased rise (1) / fall (0) weight for the airborne pose. */
  private airWeight = 1;

  constructor(
    private readonly rig: PlayerRig,
    private readonly tipPivot: Group,
    private readonly flipPivot: Group,
    private readonly visual: Group,
  ) {
    this.tipPivot.position.y = TIP_PIVOT_HEIGHT;
    this.flipPivot.position.y = FLIP_PIVOT_HEIGHT - TIP_PIVOT_HEIGHT;
    this.visual.position.y = -FLIP_PIVOT_HEIGHT;
  }

  get currentState(): AnimationState {
    return this.state;
  }

  reset(): void {
    this.backflip.reset();
    this.state = 'idle';
    this.stateTime = 0;
    this.blendDuration = 0;
    this.wasGrounded = true;
    this.airWeight = 1;
    this.target.reset();
    this.from.reset();
    this.output.reset();
    this.rig.resetToBindPose();
    this.flipPivot.quaternion.identity();
    this.tipPivot.quaternion.identity();
    this.visual.position.y = -FLIP_PIVOT_HEIGHT;
  }

  update(delta: number, input: AnimationInput): void {
    const dt = Math.max(0, delta);
    const jumpDt = dt * JUMP_ANIMATION.playbackRate;
    this.stateTime += JUMP_STATES.has(this.state) ? jumpDt : dt;
    const flipFinished = this.backflip.update(jumpDt);
    this.resolveState(input, flipFinished);
    this.writePose(dt, jumpDt, input);
    this.apply(JUMP_STATES.has(this.state) ? jumpDt : dt);
  }

  private resolveState(input: AnimationInput, flipFinished: boolean): void {
    if (input.landed || (input.grounded && !this.wasGrounded)) {
      if (this.backflip.isFlipping) this.backflip.abort();
      this.wasGrounded = true;
      this.setState('landing', TRANSITIONS.toLanding);
      return;
    }
    this.wasGrounded = input.grounded;

    if (input.airJumped) {
      this.backflip.request();
      this.setState('backflip', TRANSITIONS.toBackflip);
      return;
    }
    if (input.jumpStarted) {
      this.airWeight = 1;
      this.setState('jumpStart', TRANSITIONS.toJumpStart);
      return;
    }
    if (this.backflip.isFlipping) return;

    if (!input.grounded) {
      if (this.state === 'jumpStart' && this.stateTime < JUMP_START.duration && !flipFinished) return;
      this.setState('airborne', TRANSITIONS.toAirborne);
      return;
    }

    if (this.state === 'landing' && this.stateTime < LANDING.duration) return;
    this.setState(
      input.horizontalSpeed < LOCOMOTION.idleSpeed ? 'idle' : 'run',
      TRANSITIONS.toLocomotion,
    );
  }

  private setState(next: AnimationState, duration: number): void {
    if (next === this.state && next !== 'backflip') return;
    this.from.copyFrom(this.output);
    this.state = next;
    this.stateTime = 0;
    this.blendTime = 0;
    this.blendDuration = duration;
  }

  private writePose(dt: number, jumpDt: number, input: AnimationInput): void {
    switch (this.state) {
      case 'idle': {
        this.locomotion.settleTowardNeutral(dt);
        this.idleTime += dt;
        const breath = Math.sin(this.idleTime * IDLE.breathFrequency * Math.PI * 2);
        this.target.applyDefinition(IDLE.basePose);
        this.target.add('Spine1', breath * IDLE.breathAmount);
        this.target.add('Neck1', -breath * IDLE.breathAmount * 0.6);
        this.target.bobY = breath * IDLE.breathBob;
        break;
      }
      case 'run':
        this.locomotion.advance(dt, input.horizontalSpeed);
        this.locomotion.writePose(this.target, input.horizontalSpeed);
        break;
      case 'jumpStart':
        this.target.applyDefinition(JUMP_START.pose);
        this.target.bobY = JUMP_START.bobY;
        break;
      case 'airborne':
        this.writeAirborne(jumpDt, input.verticalVelocity);
        break;
      case 'landing': {
        const depth = 1 - ease(clamp(this.stateTime / LANDING.duration, 0, 1));
        this.target.applyDefinition(LANDING.pose, depth);
        this.target.bobY = LANDING.bobY * depth;
        break;
      }
      case 'backflip': {
        const tuck = this.backflip.tuckAmount;
        this.writeAirborne(jumpDt, input.verticalVelocity);
        this.target.blendInDefinition(BACKFLIP_ANIM.tuckPose, tuck);
        const asymmetry = BACKFLIP_ANIM.tuckAsymmetry * tuck;
        this.target.add('LegL1', asymmetry);
        this.target.add('LegR1', -asymmetry);
        this.target.bobY = 0;
        if (!this.backflip.isFlipping) this.setState('airborne', TRANSITIONS.toAirborne);
        break;
      }
    }
  }

  private writeAirborne(jumpDt: number, verticalVelocity: number): void {
    const t = clamp(verticalVelocity / AIRBORNE.velocityReference, -1, 1);
    const targetWeight = (t + 1) * 0.5;
    // Eased on the jump clock, so the arms and legs swing from the rising pose
    // to the falling one at the slowed playback rate rather than snapping with
    // the velocity.
    this.airWeight += (targetWeight - this.airWeight) * (1 - Math.exp(-JUMP_ANIMATION.airBlendRate * jumpDt));
    this.target.applyDefinition(AIRBORNE.fall, 1 - this.airWeight);
    this.target.blendInDefinition(AIRBORNE.rise, this.airWeight);
    this.target.bobY = 0;
  }

  private apply(blendDt: number): void {
    if (this.blendDuration > 0) {
      this.blendTime += blendDt;
      const t = clamp(this.blendTime / this.blendDuration, 0, 1);
      this.output.lerpBetween(this.from, this.target, ease(t));
      if (t >= 1) this.blendDuration = 0;
    } else {
      this.output.copyFrom(this.target);
    }

    this.rig.applyPose(this.output);
    // Rebuilt from a scalar every frame, so the pivot can never drift.
    this.flipPivot.quaternion.setFromAxisAngle(FLIP_AXIS, -this.backflip.rotationAngle);
    this.visual.position.y = -FLIP_PIVOT_HEIGHT + this.output.bobY;
  }
}
