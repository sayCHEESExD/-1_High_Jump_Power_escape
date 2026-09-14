import { parseEquipment, encodeEquipment } from '@highjump/shared';
import { createPersistence, type PersistenceAdapter, type StoredProfile } from '../persistence/index.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/**
 * Progression that outlives a session: a CACHE in front of a durable adapter.
 *
 * Process-wide, because a room closes with its last client. Keyed by the
 * browser-stored player id.
 */
class ProfileStore {
  private readonly profiles = new Map<string, StoredProfile>();
  private readonly adapter: PersistenceAdapter = createPersistence();
  private opened = false;

  open(): void {
    if (this.opened) return;
    this.opened = true;
    for (const [id, profile] of this.adapter.load()) this.profiles.set(id, profile);
  }

  get size(): number {
    return this.profiles.size;
  }

  entries(): IterableIterator<[string, StoredProfile]> {
    return this.profiles.entries();
  }

  /** Apply a stored profile onto fresh state. Derived figures are recomputed after. */
  restore(playerId: string, player: PlayerState): boolean {
    const profile = this.profiles.get(playerId);
    if (!profile) return false;
    player.level = Math.max(1, Math.floor(profile.level));
    player.energy = profile.energy;
    player.rebirths = Math.floor(profile.rebirths);
    player.wins = Math.floor(profile.wins);
    player.playSeconds = profile.playSeconds;
    player.ownedBoots = profile.ownedBoots & 0xffff;
    player.ownedTrails = profile.ownedTrails & 0xffff;
    player.trailSlot = profile.trailSlot & 0xff;
    player.ownedAuras = profile.ownedAuras & 0xffff;
    player.auraSlot = profile.auraSlot & 0xff;
    // Re-encoded, so an item removed from the pool since the save simply drops.
    player.equipment = encodeEquipment(parseEquipment(profile.equipment));
    return true;
  }

  save(playerId: string, player: PlayerState): void {
    if (!playerId) return;
    this.profiles.set(playerId, {
      level: player.level,
      energy: player.energy,
      rebirths: player.rebirths,
      wins: player.wins,
      playSeconds: player.playSeconds,
      ownedBoots: player.ownedBoots,
      ownedTrails: player.ownedTrails,
      trailSlot: player.trailSlot,
      ownedAuras: player.ownedAuras,
      auraSlot: player.auraSlot,
      equipment: player.equipment,
      updatedAt: Date.now(),
    });
    this.adapter.save(this.profiles);
  }

  flush(): void {
    this.adapter.flush();
  }
}

export const profileStore = new ProfileStore();
