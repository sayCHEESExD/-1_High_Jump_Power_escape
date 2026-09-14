/**
 * Everything worth keeping about a player between sessions.
 *
 * The DERIVING facts only: height, jump physics, jump count and energy per
 * step are recomputed from these on load through the same formulas a live
 * session uses, so a tuning change reaches returning players.
 */
export interface StoredProfile {
  level: number;
  energy: number;
  rebirths: number;
  wins: number;
  playSeconds: number;
  ownedBoots: number;
  ownedTrails: number;
  trailSlot: number;
  ownedAuras: number;
  auraSlot: number;
  equipment: string;
  updatedAt: number;
}

/**
 * Where profiles live. `createPersistence` is the ONLY place naming a concrete
 * adapter; nothing above this boundary knows it is a JSON file.
 */
export interface PersistenceAdapter {
  load(): Map<string, StoredProfile>;
  save(profiles: Map<string, StoredProfile>): void;
  flush(): void;
}
