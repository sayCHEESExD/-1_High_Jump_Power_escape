import { isEquippedId, type LegionEquipped } from './legionTypes.js';

/**
 * A player's Bloxity appearance as ONE short string, for replication.
 *
 * Equipped ids and nothing else - no texture, no URL, no account id - in a
 * fixed order, so the whole look is a field the room can carry on every player
 * and other clients can rebuild exactly. An unequipped slot is `-`, which is
 * also what Bloxity's own "not equipped" ids (`-1`, `''`, `undefined`) become,
 * so a DEFAULT avatar has a code of its own rather than an empty one: empty is
 * reserved for a player with no Bloxity appearance at all.
 */
const SLOTS = ['hatId', 'backId', 'skinId', 'headId', 'armLId', 'armRId', 'legLId', 'legRId', 'torsoId'] as const;

const EMPTY = '-';
/**
 * A catalogue id, which is a 24-character hex string today. The bound is
 * deliberately loose - but it IS bounded, because this is replicated.
 */
const ID = /^[A-Za-z0-9_-]{1,32}$/;

export const encodeEquipped = (equipped: LegionEquipped): string =>
  SLOTS.map((slot) => {
    const id = equipped[slot];
    return isEquippedId(id) && ID.test(id) ? id : EMPTY;
  }).join(',');

export const decodeEquipped = (code: string): LegionEquipped => {
  const parts = code.split(',');
  const equipped: Record<string, string | null> = {};
  SLOTS.forEach((slot, index) => {
    const id = parts[index];
    equipped[slot] = id && id !== EMPTY && ID.test(id) ? id : null;
  });
  return equipped as LegionEquipped;
};
