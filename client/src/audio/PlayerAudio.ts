import type { AudioManager } from './AudioManager.js';

/** World units between footfalls. */
const STRIDE = 4.2;
const MAX_STEPS_PER_SECOND = 7;
const MIN_AUDIBLE_SPEED = 2.5;

export interface PlayerAudioInput {
  readonly horizontalSpeed: number;
  readonly maxRunSpeed: number;
  readonly isGrounded: boolean;
  readonly justLanded: boolean;
  readonly isDying: boolean;
  readonly onActiveTreadmill: boolean;
}

/**
 * Decides WHEN the local player makes a sound; `AudioManager` knows HOW.
 * Only the local player is heard. Deaths fire on the edge, not the level.
 */
export class PlayerAudio {
  private stride = 0;
  private sinceStep = 0;
  private wasDying = false;

  constructor(private readonly audio: AudioManager) {}

  /** Jumps are reported as events so a ground jump and an air flip sound different. */
  jumped(air: boolean): void {
    this.audio.play(air ? 'flip' : 'jump');
  }

  update(delta: number, player: PlayerAudioInput): void {
    if (player.isDying) {
      if (!this.wasDying) this.audio.play('death');
      this.wasDying = true;
      this.stride = 0;
      return;
    }
    this.wasDying = false;

    if (player.justLanded) this.audio.play('land', Math.min(player.horizontalSpeed / player.maxRunSpeed, 1));

    this.sinceStep += delta;
    const speed = player.onActiveTreadmill ? player.maxRunSpeed : player.horizontalSpeed;
    if (!player.isGrounded || speed < MIN_AUDIBLE_SPEED) {
      this.stride = 0;
      return;
    }
    this.stride += speed * delta;
    if (this.stride < STRIDE) return;
    this.stride = 0;
    if (this.sinceStep < 1 / MAX_STEPS_PER_SECOND) return;
    this.sinceStep = 0;
    this.audio.play('step', Math.min(speed / player.maxRunSpeed, 1));
  }
}
