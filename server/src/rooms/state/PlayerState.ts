import { Schema, type } from '@colyseus/schema';
import { SPAWN_POSITION, SPAWN_ROTATION_Y } from '@highjump/shared';

/**
 * Replicated per-player state.
 *
 * Every field is written by the SERVER. Transform and motion come out of the
 * authoritative simulation; progression, Wins and inventories are written
 * only by their own service. Nothing is ever copied from a client message.
 */
export class PlayerState extends Schema {
  @type('string') sessionId = '';
  /** Derived from the player's id; the id itself never leaves the server. */
  @type('string') handle = '';

  @type('float32') x: number = SPAWN_POSITION.x;
  @type('float32') y: number = SPAWN_POSITION.y;
  @type('float32') z: number = SPAWN_POSITION.z;
  @type('float32') rotationY: number = SPAWN_ROTATION_Y;

  @type('float32') speed = 0;
  @type('float32') verticalVelocity = 0;
  @type('boolean') grounded = true;
  @type('float32') velocityX = 0;
  @type('float32') velocityY = 0;
  @type('float32') velocityZ = 0;
  @type('uint32') lastInputSeq = 0;

  /** Latched simulation state, so client replay resumes exactly where the server stopped. */
  @type('boolean') jumpLatched = false;
  @type('float32') coyote = 0;
  @type('uint8') jumpsUsed = 0;

  /** Monotonic counters, so remote clients derive one-shot animations. */
  @type('uint32') jumpCount = 0;
  @type('uint32') flipCount = 0;
  @type('uint32') deathCount = 0;

  /** Belt underfoot, derived by the simulation from the server's own position. */
  @type('uint8') treadmill = 0;

  // ---- progression (server-authoritative)
  @type('uint32') level = 1;
  /** Energy banked toward the next level. */
  @type('float64') energy = 0;
  /** Lifetime energy, for the gain popups only. Never spent. */
  @type('float64') lifetimeEnergy = 0;
  @type('uint32') rebirths = 0;
  @type('float64') wins = 0;
  /** Seconds played, for the Time board. */
  @type('float64') playSeconds = 0;

  // ---- derived from progression by EnergyService
  @type('float32') height = 8;
  @type('float32') jumpVelocity = 40;
  @type('float32') gravity = 100;
  @type('uint8') maxJumps = 1;
  @type('float32') energyPerStep = 1;

  // ---- inventories
  @type('uint16') ownedBoots = 0;
  @type('uint16') ownedTrails = 0;
  @type('uint8') trailSlot = 0;
  @type('uint16') ownedAuras = 0;
  @type('uint8') auraSlot = 0;
  /** Backpack, encoded by `encodeEquipment`. */
  @type('string') equipment = '';
  /** Which restock the purchase mask below refers to. */
  @type('uint32') shopBoughtSlot = 0;
  @type('uint8') shopBoughtMask = 0;

  /** True once the server has simulated at least one input for this player. */
  @type('boolean') ready = false;
}
