import { Group, Vector3 } from 'three';
import {
  AIRBORNE,
  BACKFLIP_ANIM,
  DEATH,
  FLIP_PIVOT_HEIGHT,
  IDLE,
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
/** The death tip-over turns about the character's forward axis. */
const TIP_AXIS = new Vector3(0, 0, 1);

export type AnimationState =
  | 'idle'
  | 'run'
  | 'jumpStart'
  | 'airborne'
  | 'backflip'
  | 'landing'
  | 'dying';

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * The player animation state machine: run, jump, backflip (air jumps), land and
 * the death fall-over.
 *
 * Writes ONLY to bones (via `PlayerRig`), the flip pivot, the tip pivot and the
 * visual bob node. It never touches the physics root.
 *
 * Each state writes a full pose into a buffer and transitions lerp from a
 * snapshot of what was on screen, so any two states cross-fade.
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
  private deathTime = -1;

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
    this.deathTime = -1;
    this.wasGrounded = true;
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
    this.stateTime += dt;
    const flipFinished = this.backflip.update(dt);
    this.resolveState(dt, input, flipFinished);
    this.writePose(dt, input);
    this.apply(dt);
  }

  private resolveState(delta: number, input: AnimationInput, flipFinished: boolean): void {
    if (input.dying) {
      this.deathTime = this.deathTime < 0 ? 0 : this.deathTime + delta;
      if (this.backflip.isFlipping) this.backflip.abort();
      this.setState('dying', TRANSITIONS.toDying);
      return;
    }
    this.deathTime = -1;

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

  private writePose(delta: number, input: AnimationInput): void {
    switch (this.state) {
      case 'idle': {
        this.locomotion.settleTowardNeutral(delta);
        this.idleTime += delta;
        const breath = Math.sin(this.idleTime * IDLE.breathFrequency * Math.PI * 2);
        this.target.applyDefinition(IDLE.basePose);
        this.target.add('Spine1', breath * IDLE.breathAmount);
        this.target.add('Neck1', -breath * IDLE.breathAmount * 0.6);
        this.target.bobY = breath * IDLE.breathBob;
        break;
      }
      case 'run':
        this.locomotion.advance(delta, input.horizontalSpeed);
        this.locomotion.writePose(this.target, input.horizontalSpeed);
        break;
      case 'jumpStart':
        this.target.applyDefinition(JUMP_START.pose);
        this.target.bobY = JUMP_START.bobY;
        break;
      case 'airborne':
        this.writeAirborne(input.verticalVelocity);
        break;
      case 'landing': {
        const depth = 1 - ease(clamp(this.stateTime / LANDING.duration, 0, 1));
        this.target.applyDefinition(LANDING.pose, depth);
        this.target.bobY = LANDING.bobY * depth;
        break;
      }
      case 'backflip': {
        const tuck = this.backflip.tuckAmount;
        this.writeAirborne(input.verticalVelocity);
        this.target.blendInDefinition(BACKFLIP_ANIM.tuckPose, tuck);
        const asymmetry = BACKFLIP_ANIM.tuckAsymmetry * tuck;
        this.target.add('LegL1', asymmetry);
        this.target.add('LegR1', -asymmetry);
        this.target.bobY = 0;
        if (!this.backflip.isFlipping) this.setState('airborne', TRANSITIONS.toAirborne);
        break;
      }
      case 'dying': {
        const t = clamp(this.deathTime / DEATH.duration, 0, 1);
        this.target.reset();
        this.target.add('Spine1', DEATH.pitch * 0.6, 0, DEATH.roll * 0.12);
        this.target.add('Neck1', -DEATH.pitch * 0.4);
        this.target.add('ArmL1', -DEATH.splay * 1.4, 0, -DEATH.splay);
        this.target.add('ArmR1', -DEATH.splay * 1.2, 0, DEATH.splay);
        this.target.add('LegL1', -DEATH.splay * 0.5, DEATH.splay * 0.4);
        this.target.add('LegR1', -DEATH.splay * 0.3, -DEATH.splay * 0.4);
        this.target.bobY = -DEATH.drop * t;
        break;
      }
    }
  }

  private writeAirborne(verticalVelocity: number): void {
    const t = clamp(verticalVelocity / AIRBORNE.velocityReference, -1, 1);
    const rise = (t + 1) * 0.5;
    this.target.applyDefinition(AIRBORNE.fall, 1 - rise);
    this.target.blendInDefinition(AIRBORNE.rise, rise);
    this.target.bobY = 0;
  }

  private apply(delta: number): void {
    if (this.blendDuration > 0) {
      this.blendTime += delta;
      const t = clamp(this.blendTime / this.blendDuration, 0, 1);
      this.output.lerpBetween(this.from, this.target, ease(t));
      if (t >= 1) this.blendDuration = 0;
    } else {
      this.output.copyFrom(this.target);
    }

    this.rig.applyPose(this.output);
    // Rebuilt from scalars every frame, so neither pivot can drift.
    this.flipPivot.quaternion.setFromAxisAngle(FLIP_AXIS, -this.backflip.rotationAngle);
    const death = this.deathTime < 0 ? 0 : clamp(this.deathTime / DEATH.duration, 0, 1);
    this.tipPivot.quaternion.setFromAxisAngle(TIP_AXIS, DEATH.roll * ease(death));
    this.visual.position.y = -FLIP_PIVOT_HEIGHT + this.output.bobY;
  }
}
