/**
 * Network-level constants. Must stay identical on client and server.
 */

/** Colyseus room registered by the server and joined by the client. */
export const ROOM_NAME = 'highjumpescape';

/**
 * Default server port. Override with the PORT env var on the server.
 *
 * Deliberately not 2567-2569: the previous games in this series answer on
 * those, and sharing one would mean whichever server started first silently
 * served every client.
 */
export const DEFAULT_SERVER_PORT = 2570;

/**
 * Most players in ONE room. The matchmaker locks a full room and
 * `joinOrCreate` opens another, so the sixteenth player is routed, not refused.
 */
export const MAX_PLAYERS_PER_ROOM = 15;

/** Server simulation / state broadcast rate, in Hz. */
export const SERVER_TICK_RATE = 20;

/** Milliseconds between server ticks. */
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

/** Client <-> server message identifiers. Every client message is a REQUEST. */
export const MessageType = {
  /** Client -> server: one frame of INPUT. Never a transform. */
  Move: 'move',
  /** Server -> client: authoritative respawn instruction. */
  Respawn: 'respawn',
  /** Client -> server: "put me back at spawn". */
  RequestRespawn: 'requestRespawn',
  /** Client -> server: "I am standing on this biome's win pad". */
  ClaimWin: 'claimWin',
  /** Server -> client: a win was granted. Drives the celebration. */
  WinAwarded: 'winAwarded',
  /** Client -> server: "rebirth me". Carries nothing. */
  Rebirth: 'rebirth',
  /** Client -> server: "I am on this boot pedestal, sell it to me". */
  BuyBoot: 'buyBoot',
  BuyTrail: 'buyTrail',
  EquipTrail: 'equipTrail',
  BuyAura: 'buyAura',
  EquipAura: 'equipAura',
  /** Client -> server: buy one of the three items currently in stock. */
  BuyItem: 'buyItem',
  /** Client -> server: equip the best owned equipment. */
  EquipBest: 'equipBest',
  /** Client -> server: toggle one backpack item on or off. */
  ToggleItem: 'toggleItem',
  /** Client -> server: delete one backpack item. */
  DeleteItem: 'deleteItem',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
