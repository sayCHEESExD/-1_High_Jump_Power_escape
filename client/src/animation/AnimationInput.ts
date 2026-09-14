/**
 * The gameplay signals the animator consumes each frame. It reads these and
 * never writes back: it cannot move the player or decide an outcome.
 *
 * The local player fills it from its own prediction and every remote player
 * from replicated state, so both run the exact same animation code.
 */
export interface AnimationInput {
  grounded: boolean;
  /** Horizontal speed; on a treadmill, the speed they are running AT. */
  horizontalSpeed: number;
  verticalVelocity: number;
  /** True on the frame a ground jump starts. */
  jumpStarted: boolean;
  /** True on the frame an AIR jump starts - which is a backflip. */
  airJumped: boolean;
  landed: boolean;
  dying: boolean;
}

export const createAnimationInput = (): AnimationInput => ({
  grounded: true,
  horizontalSpeed: 0,
  verticalVelocity: 0,
  jumpStarted: false,
  airJumped: false,
  landed: false,
  dying: false,
});
