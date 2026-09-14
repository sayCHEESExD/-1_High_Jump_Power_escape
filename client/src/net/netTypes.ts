import type { MapSchema } from '@colyseus/schema';

/**
 * Client-side TYPE mirror of the server's Colyseus schema. Types only -
 * colyseus.js builds the instances from the handshake reflection.
 */
export interface NetPlayerState {
  sessionId: string;
  handle: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  speed: number;
  verticalVelocity: number;
  grounded: boolean;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  lastInputSeq: number;
  jumpLatched: boolean;
  coyote: number;
  jumpsUsed: number;
  jumpCount: number;
  flipCount: number;
  treadmill: number;

  level: number;
  energy: number;
  lifetimeEnergy: number;
  rebirths: number;
  wins: number;
  playSeconds: number;

  height: number;
  jumpVelocity: number;
  gravity: number;
  maxJumps: number;
  energyPerStep: number;

  ownedBoots: number;
  ownedTrails: number;
  trailSlot: number;
  ownedAuras: number;
  auraSlot: number;
  equipment: string;
  shopBoughtSlot: number;
  shopBoughtMask: number;

  ready: boolean;
}

export interface NetLeaderEntry {
  handle: string;
  value: number;
}

export interface NetLeaderboardState {
  time: ArrayLike<NetLeaderEntry>;
  wins: ArrayLike<NetLeaderEntry>;
  level: ArrayLike<NetLeaderEntry>;
}

export interface NetGameState {
  players: MapSchema<NetPlayerState>;
  leaderboard: NetLeaderboardState;
  shopSlot: number;
  shopRemaining: number;
}

export interface LeaderboardSnapshot {
  time: readonly NetLeaderEntry[];
  wins: readonly NetLeaderEntry[];
  level: readonly NetLeaderEntry[];
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
