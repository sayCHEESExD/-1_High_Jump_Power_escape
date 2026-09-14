import { LEADERBOARD_SIZE, handleFor } from '@highjump/shared';
import type { LeaderEntry, LeaderboardState } from '../rooms/state/GameState.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { profileStore } from './ProfileStore.js';

const REFRESH_SECONDS = 2;

interface Candidate {
  readonly handle: string;
  readonly time: number;
  readonly wins: number;
  readonly level: number;
  readonly rebirths: number;
}

/**
 * The Time, Wins and Level boards. Every figure is the server's: stored
 * profiles merged with live state (live wins where both exist). Rebuilt on a
 * slow timer - nobody reads a board twenty times a second.
 */
export class LeaderboardService {
  private timer = 0;

  update(
    delta: number,
    board: LeaderboardState,
    live: Iterable<[string, PlayerState]>,
    playerIds: ReadonlyMap<string, string>,
  ): void {
    this.timer -= delta;
    if (this.timer > 0) return;
    this.timer = REFRESH_SECONDS;

    const byId = new Map<string, Candidate>();
    for (const [id, profile] of profileStore.entries()) {
      byId.set(id, {
        handle: handleFor(id),
        time: profile.playSeconds,
        wins: profile.wins,
        level: profile.level,
        rebirths: profile.rebirths,
      });
    }
    for (const [sessionId, player] of live) {
      const id = playerIds.get(sessionId);
      if (!id) continue;
      byId.set(id, {
        handle: handleFor(id),
        time: player.playSeconds,
        wins: player.wins,
        level: player.level,
        rebirths: player.rebirths,
      });
    }

    const all = [...byId.values()];
    fill(board.time, all, (c) => c.time, 60);
    fill(board.wins, all, (c) => c.wins, 1);
    // Level ties break on rebirths, which is the harder-won figure.
    fill(board.level, all, (c) => c.level, 1, (c) => c.rebirths);
  }
}

const fill = (
  into: ArrayLike<LeaderEntry>,
  all: readonly Candidate[],
  pick: (candidate: Candidate) => number,
  minimum: number,
  tieBreak: (candidate: Candidate) => number = () => 0,
): void => {
  const ranked = all
    .filter((candidate) => pick(candidate) >= minimum)
    .sort((a, b) => pick(b) - pick(a) || tieBreak(b) - tieBreak(a))
    .slice(0, LEADERBOARD_SIZE);

  for (let i = 0; i < LEADERBOARD_SIZE; i += 1) {
    const entry = into[i];
    if (!entry) continue;
    const candidate = ranked[i];
    const handle = candidate ? candidate.handle : '';
    const value = candidate ? Math.floor(pick(candidate)) : 0;
    if (entry.handle !== handle) entry.handle = handle;
    if (entry.value !== value) entry.value = value;
  }
};

export const leaderboardService = new LeaderboardService();
