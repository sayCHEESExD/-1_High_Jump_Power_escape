/**
 * Movement tuning. The client predicts with these numbers and the server
 * simulates with them, so there is exactly one copy, here.
 *
 * Horizontal movement is deliberately NOT a progression axis in this game:
 * progression buys JUMP HEIGHT and JUMP COUNT. A staircase obby where the run
 * speed also ran away would turn every landing into an overshoot.
 */
export interface MovementConfig {
  /** Ground speed, world units per second. */
  readonly walkSpeed: number;
  /** Sprint speed (Shift, or the stick at full deflection). */
  readonly runSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  /** Fraction of ground acceleration retained while airborne (0..1). */
  readonly airControl: number;
  /** Turn rate toward the movement direction, radians per second. */
  readonly turnSpeed: number;
  /** Largest distance one substep may integrate. See `stepPlayer`. */
  readonly maxSubstepDistance: number;
  readonly maxSubsteps: number;
  /** Height the player steps up without jumping. Pads and decks sit under it. */
  readonly stepHeight: number;
  /** Seconds after leaving a ledge during which the ground jump still counts. */
  readonly coyoteTime: number;
  /** Terminal fall speed as a multiple of the player's own jump velocity. */
  readonly terminalFactor: number;
  /** Terminal fall speed never drops below this. */
  readonly minTerminal: number;
}

export const MOVEMENT: MovementConfig = {
  walkSpeed: 24,
  runSpeed: 30,
  acceleration: 150,
  deceleration: 120,
  airControl: 0.72,
  turnSpeed: 12,
  maxSubstepDistance: 0.8,
  maxSubsteps: 96,
  stepHeight: 0.9,
  coyoteTime: 0.11,
  terminalFactor: 1.4,
  minTerminal: 70,
};

/**
 * How a jump HEIGHT becomes launch velocity and gravity.
 *
 * Height is the progression figure ("Height: 36"), so the physics is solved
 * backwards from it: a jump reaches exactly `height` units. The time to the
 * apex grows only logarithmically with height - a level-900 player jumps
 * hundreds of units but is not left floating for ten seconds - which is what
 * keeps the movement arcade-snappy at every stage of the game.
 */
export const JUMP_PHYSICS = {
  /** Height at which the apex time equals `apexTimeBase`. */
  referenceHeight: 8,
  /** Seconds to the apex of a reference-height jump. */
  apexTimeBase: 0.36,
  /** Extra seconds to the apex each time the height doubles. */
  apexTimePerDoubling: 0.055,
  /** Longest the rise may ever take. */
  apexTimeMax: 0.85,
} as const;

export interface JumpPhysics {
  readonly height: number;
  readonly velocity: number;
  readonly gravity: number;
}

/** Resolve launch velocity and gravity for a jump that peaks at `height`. */
export const resolveJumpPhysics = (height: number): JumpPhysics => {
  const h = Number.isFinite(height) && height > 1 ? height : 1;
  const doublings = Math.log2(Math.max(1, h / JUMP_PHYSICS.referenceHeight));
  const t = Math.min(
    JUMP_PHYSICS.apexTimeBase + JUMP_PHYSICS.apexTimePerDoubling * doublings,
    JUMP_PHYSICS.apexTimeMax,
  );
  return { height: h, velocity: (2 * h) / t, gravity: (2 * h) / (t * t) };
};
