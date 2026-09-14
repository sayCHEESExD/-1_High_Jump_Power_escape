import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import { LEADERBOARD_SIZE } from '@highjump/shared';
import { PlayerState } from './PlayerState.js';

export class LeaderEntry extends Schema {
  @type('string') handle = '';
  @type('float64') value = 0;
}

/**
 * The three boards in the hub: Time, Wins, Level.
 *
 * FIXED-LENGTH arrays written in place, so a rebuild sends only the rows that
 * actually moved.
 */
export class LeaderboardState extends Schema {
  @type([LeaderEntry]) time = rows();
  @type([LeaderEntry]) wins = rows();
  @type([LeaderEntry]) level = rows();
}

const rows = (): ArraySchema<LeaderEntry> => {
  const list = new ArraySchema<LeaderEntry>();
  for (let i = 0; i < LEADERBOARD_SIZE; i += 1) list.push(new LeaderEntry());
  return list;
};

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type(LeaderboardState) leaderboard = new LeaderboardState();
  /** Current equipment restock slot. The shelf is a pure function of it. */
  @type('uint32') shopSlot = 0;
  /** Whole seconds until the next restock. */
  @type('uint16') shopRemaining = 0;
}
