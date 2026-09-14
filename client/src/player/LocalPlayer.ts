import {
  MOVEMENT,
  TRAINING,
  WorldCollision,
  createMotion,
  createSimEvents,
  horizontalSpeed,
  resetMotion,
  stepPlayer,
  treadmillRate,
  type MoveMessage,
  type MovementInput,
  type PlayerMotion,
  type SimParams,
} from '@highjump/shared';
import { Vector3 } from 'three';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import { DEATH } from '../config/animationConfig.js';
import type { InputState } from '../input/InputState.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const MAX_PENDING_INPUTS = 240;
/** The client steps AND sends at exactly this cadence, whatever the frame rate. */
const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const ARRIVE_DURATION = 0.16;
/** Failsafe: stop ignoring server state if a predicted death is never confirmed. */
const RESPAWN_ACK_TIMEOUT = 1.5;
/** A finished death that nobody placed asks again this often. */
const RESPAWN_NUDGE_INTERVAL = 0.75;
const SNAP_DISTANCE = 6;
const CORRECTION_RATE = 14;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const EMPTY_INPUTS: MoveMessage[] = [];

export type PlacementKind = 'none' | 'respawn' | 'correction';

interface PendingInput {
  seq: number;
  dt: number;
  input: MovementInput;
}

/** Every field of `PlayerMotion` the server owns, so replay is exact. */
export interface AuthoritativeMotion {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  grounded: boolean;
  jumpCount: number;
  flipCount: number;
  jumpsUsed: number;
  lastInputSeq: number;
  jumpLatched: boolean;
  coyote: number;
}

/**
 * The locally controlled player: a PREDICTION of the server's simulation.
 *
 * Runs the identical `stepPlayer`, keeps every unacknowledged input, and on each
 * server update snaps to the authoritative motion and replays the rest. Nothing
 * here sends a transform - only the input that produced this frame.
 */
export class LocalPlayer {
  readonly character = new PlayerCharacter();
  /** THE render position: interpolated simulation plus the eased correction. */
  readonly position = new Vector3();

  private readonly previous = { x: 0, y: 0, z: 0 };
  private readonly motion: PlayerMotion = createMotion();
  private readonly events = createSimEvents();
  private readonly replayEvents = createSimEvents();
  private readonly params: SimParams = { jumpVelocity: 40, gravity: 100, maxJumps: 1 };
  private rebirths = 0;

  private readonly pending: PendingInput[] = [];
  private nextSeq = 1;
  private readonly outgoing: MoveMessage[] = [];
  private accumulator = 0;
  private readonly correction = new Vector3();
  private placement: PlacementKind = 'none';

  private deathTime = -1;
  private arriveTime = -1;
  private awaitingRespawn = false;
  private respawnWait = 0;
  private stuckTime = -1;

  private readonly animationInput: AnimationInput = createAnimationInput();

  constructor(private readonly collision: WorldCollision) {
    this.previous.x = this.motion.x;
    this.previous.y = this.motion.y;
    this.previous.z = this.motion.z;
    this.syncFromMotion();
  }

  get horizontalSpeed(): number {
    return horizontalSpeed(this.motion);
  }
  get rotationY(): number {
    return this.motion.yaw;
  }
  get isGrounded(): boolean {
    return this.motion.grounded;
  }
  get justLanded(): boolean {
    return this.events.landed;
  }
  get justJumped(): boolean {
    return this.events.jumpStarted || this.events.airJumped;
  }
  /** Which jump, if any, started this frame - an air jump is a backflip. */
  get jumpKind(): 'none' | 'ground' | 'air' {
    if (this.deathTime >= 0) return 'none';
    return this.events.airJumped ? 'air' : this.events.jumpStarted ? 'ground' : 'none';
  }
  get maxRunSpeed(): number {
    return MOVEMENT.runSpeed;
  }
  get jumpsLeft(): number {
    return this.motion.grounded ? this.params.maxJumps : Math.max(0, this.params.maxJumps - this.motion.jumpsUsed);
  }
  /** On a belt this player has unlocked, so the animation should run. */
  get onActiveTreadmill(): boolean {
    return this.motion.treadmill > 0 && treadmillRate(this.motion.treadmill, this.rebirths) > 0;
  }
  get isDying(): boolean {
    return this.deathTime >= 0;
  }
  get deathComplete(): boolean {
    return this.deathTime >= DEATH.duration;
  }

  /** The server-resolved jump physics this player simulates with. */
  setProgression(jumpVelocity: number, gravity: number, maxJumps: number, rebirths: number): void {
    if (Number.isFinite(jumpVelocity) && jumpVelocity > 0) this.params.jumpVelocity = jumpVelocity;
    if (Number.isFinite(gravity) && gravity > 0) this.params.gravity = gravity;
    if (Number.isFinite(maxJumps) && maxJumps >= 1) this.params.maxJumps = maxJumps;
    this.rebirths = rebirths;
  }

  drainOutgoing(): MoveMessage[] {
    if (this.outgoing.length === 0) return EMPTY_INPUTS;
    const batch = this.outgoing.slice();
    this.outgoing.length = 0;
    return batch;
  }

  consumePlacement(): PlacementKind {
    const kind = this.placement;
    this.placement = 'none';
    return kind;
  }

  consumeRespawnNudge(): boolean {
    if (this.stuckTime < RESPAWN_NUDGE_INTERVAL) return false;
    this.stuckTime = 0;
    return true;
  }

  acknowledgeRespawn(): void {
    this.awaitingRespawn = false;
    this.respawnWait = 0;
  }

  /** A server placement: pending inputs described a run that no longer exists. */
  teleport(x: number, y: number, z: number, rotationY: number): void {
    resetMotion(this.motion, x, y, z, rotationY);
    this.previous.x = x;
    this.previous.y = y;
    this.previous.z = z;
    this.pending.length = 0;
    this.outgoing.length = 0;
    this.accumulator = 0;
    this.correction.set(0, 0, 0);
    this.placement = 'respawn';
    this.deathTime = -1;
    this.stuckTime = -1;
    this.arriveTime = 0;
    this.character.resetAnimation();
    this.character.setVisualScale(0.15, 0.15, 0.15);
    this.syncFromMotion();
  }

  /** Start the local fall-over; the server confirms with a Respawn. */
  beginDeath(): void {
    if (this.deathTime >= 0) return;
    this.deathTime = 0;
    this.arriveTime = -1;
    this.awaitingRespawn = true;
    this.respawnWait = 0;
    this.stuckTime = -1;
    this.pending.length = 0;
    this.outgoing.length = 0;
    this.correction.set(0, 0, 0);
    this.accumulator = 0;
    this.motion.vx = 0;
    this.motion.vy = 0;
    this.motion.vz = 0;
  }

  reconcile(state: AuthoritativeMotion): void {
    if (this.awaitingRespawn) return;

    const px = this.motion.x;
    const py = this.motion.y;
    const pz = this.motion.z;

    this.motion.x = state.x;
    this.motion.y = state.y;
    this.motion.z = state.z;
    this.motion.vx = state.velocityX;
    this.motion.vy = state.velocityY;
    this.motion.vz = state.velocityZ;
    this.motion.yaw = state.rotationY;
    this.motion.grounded = state.grounded;
    this.motion.jumpCount = state.jumpCount;
    this.motion.flipCount = state.flipCount;
    this.motion.jumpsUsed = state.jumpsUsed;
    this.motion.jumpLatched = state.jumpLatched;
    this.motion.coyote = state.coyote;

    let kept = 0;
    for (const entry of this.pending) {
      if (entry.seq <= state.lastInputSeq) continue;
      this.pending[kept] = entry;
      kept += 1;
    }
    this.pending.length = kept;
    for (const entry of this.pending) {
      stepPlayer(this.motion, entry.input, this.params, entry.dt, this.collision, this.replayEvents);
    }

    const dx = px - this.motion.x;
    const dy = py - this.motion.y;
    const dz = pz - this.motion.z;
    const snapped = Math.hypot(dx, dy, dz) > SNAP_DISTANCE;
    this.correction.set(snapped ? 0 : dx, snapped ? 0 : dy, snapped ? 0 : dz);
    if (snapped) {
      this.previous.x = this.motion.x;
      this.previous.y = this.motion.y;
      this.previous.z = this.motion.z;
      if (this.placement === 'none') this.placement = 'correction';
    }
    this.syncFromMotion();
  }

  update(delta: number, input: Readonly<InputState>, cameraYaw: number): void {
    this.tickRespawnBarrier(delta);

    if (this.deathTime >= 0) {
      this.deathTime += delta;
      if (this.deathTime >= DEATH.duration) {
        this.stuckTime = this.stuckTime < 0 ? 0 : this.stuckTime + delta;
      }
      this.emitIdleInputs(delta);
      this.updateAnimation(delta, true);
      return;
    }

    this.accumulator += Math.max(0, delta);
    let steps = 0;
    let jumpStarted = false;
    let airJumped = false;
    let landed = false;

    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_DT;
      steps += 1;
      const movement: MovementInput = {
        moveX: input.moveX,
        moveZ: input.moveZ,
        jump: input.jump,
        sprint: input.sprint,
        cameraYaw,
      };
      const seq = this.nextSeq;
      this.nextSeq += 1;
      this.previous.x = this.motion.x;
      this.previous.y = this.motion.y;
      this.previous.z = this.motion.z;

      stepPlayer(this.motion, movement, this.params, FIXED_DT, this.collision, this.events);
      jumpStarted = jumpStarted || this.events.jumpStarted;
      airJumped = airJumped || this.events.airJumped;
      landed = landed || this.events.landed;

      this.pending.push({ seq, dt: FIXED_DT, input: movement });
      if (this.pending.length > MAX_PENDING_INPUTS) this.pending.shift();
      this.outgoing.push({ seq, dt: FIXED_DT, ...movement });
    }
    if (this.accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.events.jumpStarted = jumpStarted;
    this.events.airJumped = airJumped;
    this.events.landed = landed;

    this.advanceArrival(delta);
    if (this.correction.lengthSq() < 1e-8) this.correction.set(0, 0, 0);
    else this.correction.multiplyScalar(Math.exp(-CORRECTION_RATE * delta));
    this.syncFromMotion();
    this.updateAnimation(delta, false);
  }

  private advanceArrival(delta: number): void {
    if (this.arriveTime < 0) return;
    this.arriveTime += delta;
    const t = Math.min(this.arriveTime / ARRIVE_DURATION, 1);
    if (t >= 1) {
      this.arriveTime = -1;
      this.character.setVisualScale(1, 1, 1);
      return;
    }
    const scale = 0.15 + 0.85 * t * (2 - t) + 0.08 * Math.sin(t * Math.PI);
    this.character.setVisualScale(scale, scale, scale);
  }

  /** While dead the server still needs inputs to confirm the fall. */
  private emitIdleInputs(delta: number): void {
    this.accumulator += Math.max(0, delta);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_DT;
      steps += 1;
      this.outgoing.push({
        seq: this.nextSeq,
        dt: FIXED_DT,
        moveX: 0,
        moveZ: 0,
        jump: false,
        sprint: false,
        cameraYaw: this.motion.yaw,
      });
      this.nextSeq += 1;
    }
    if (this.accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) this.accumulator = 0;
  }

  private tickRespawnBarrier(delta: number): void {
    if (!this.awaitingRespawn) return;
    this.respawnWait += delta;
    if (this.respawnWait < RESPAWN_ACK_TIMEOUT) return;
    this.awaitingRespawn = false;
    this.respawnWait = 0;
  }

  private syncFromMotion(): void {
    const alpha = Math.min(Math.max(this.accumulator / FIXED_DT, 0), 1);
    this.position.set(
      lerp(this.previous.x, this.motion.x, alpha) + this.correction.x,
      lerp(this.previous.y, this.motion.y, alpha) + this.correction.y,
      lerp(this.previous.z, this.motion.z, alpha) + this.correction.z,
    );
    this.character.setPosition(this.position.x, this.position.y, this.position.z);
    this.character.setYaw(this.motion.yaw);
  }

  private updateAnimation(delta: number, dying: boolean): void {
    const input = this.animationInput;
    input.grounded = this.motion.grounded;
    input.horizontalSpeed = this.onActiveTreadmill ? TRAINING.beltSpeed : this.horizontalSpeed;
    input.verticalVelocity = this.motion.vy;
    input.jumpStarted = !dying && this.events.jumpStarted;
    input.airJumped = !dying && this.events.airJumped;
    input.landed = !dying && this.events.landed;
    input.dying = dying;
    this.character.update(delta, input);
    this.character.updateEffects(delta, dying ? 0 : input.horizontalSpeed);
  }
}
