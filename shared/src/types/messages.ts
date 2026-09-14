/**
 * Client -> server input. INPUT ONLY: no position, velocity or rotation, so a
 * client has no channel through which to assert where it is.
 */
export interface MoveMessage {
  seq: number;
  dt: number;
  moveX: number;
  moveZ: number;
  jump: boolean;
  cameraYaw: number;
}

export type RespawnReason = 'outOfWorld' | 'win' | 'manual' | 'join' | 'rebirth';

export interface RespawnMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  reason: RespawnReason;
}

/** "I am standing on this biome's win pad." A request, never a grant. */
export interface ClaimWinMessage {
  biome: number;
}

/** A win landed. Presentation only. */
export interface WinAwardedMessage {
  biome: number;
  wins: number;
  total: number;
}

/** A slot-addressed request: boots, trails, auras. */
export interface SlotMessage {
  slot: number;
}

/** An index-addressed request: shop stock or backpack entry. */
export interface IndexMessage {
  index: number;
}

/**
 * "My Bloxity token is now this." A TOKEN, not an id: the server resolves it
 * with Bloxity, so nobody can claim another account's paid-for Bux grants by
 * naming its id. Empty means logged out.
 */
export interface BloxityIdentityMessage {
  token: string;
}
