/**
 * Equipment: the item shop at the foot of the staircase and the backpack.
 *
 * The shop sells three random items from `ITEM_POOL`, restocking every
 * `SHOP.restockSeconds`. The stock is a PURE FUNCTION of the restock slot
 * (wall-clock time divided by the restock period), so every room and every
 * client computes the same shelf without any of it being stored.
 *
 * An item adds a percentage to jump height while equipped. A player owns at
 * most `SHOP.maxOwned` items.
 */
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export interface RarityInfo {
  /** Relative chance of a shelf slot rolling this rarity. */
  readonly weight: number;
  readonly color: string;
}

export const RARITIES: Readonly<Record<Rarity, RarityInfo>> = {
  Common: { weight: 40, color: '#9ca3af' },
  Uncommon: { weight: 30, color: '#4ade80' },
  Rare: { weight: 16, color: '#38bdf8' },
  Epic: { weight: 9, color: '#a78bfa' },
  Legendary: { weight: 4, color: '#fbbf24' },
  Mythic: { weight: 1, color: '#f472b6' },
};

export interface ItemDefinition {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  /** Wins deducted on purchase. */
  readonly price: number;
  /** Jump height bonus while equipped, in percent. */
  readonly heightBonus: number;
  /** Presentation colour for the icon gem. */
  readonly color: number;
}

export const ITEM_POOL: readonly ItemDefinition[] = [
  { id: 'pebble', name: 'Lucky Pebble', rarity: 'Common', price: 10, heightBonus: 1, color: 0x9ca3af },
  { id: 'feather', name: 'Feather', rarity: 'Common', price: 20, heightBonus: 2, color: 0xf5f5f4 },
  { id: 'forest_gem', name: 'Forest Gem', rarity: 'Uncommon', price: 50, heightBonus: 3, color: 0x4ade80 },
  { id: 'crystal', name: 'Crystal', rarity: 'Uncommon', price: 50, heightBonus: 4, color: 0xc084fc },
  { id: 'fossil', name: 'Fossil', rarity: 'Rare', price: 800, heightBonus: 6, color: 0xd6b58a },
  { id: 'magic_ice', name: 'Magic Ice', rarity: 'Rare', price: 800, heightBonus: 7, color: 0x7dd3fc },
  { id: 'candy', name: 'Candy', rarity: 'Epic', price: 15_000, heightBonus: 10, color: 0xf472b6 },
  { id: 'meteorite', name: 'Meteorite', rarity: 'Epic', price: 40_000, heightBonus: 12, color: 0xf97316 },
  { id: 'dragon_scale', name: 'Dragon Scale', rarity: 'Legendary', price: 750_000, heightBonus: 20, color: 0xef4444 },
  { id: 'star_core', name: 'Star Core', rarity: 'Legendary', price: 8_000_000, heightBonus: 25, color: 0xfde047 },
  { id: 'void_shard', name: 'Void Shard', rarity: 'Mythic', price: 250_000_000, heightBonus: 40, color: 0x7c3aed },
];

export const SHOP = {
  /** Seconds between restocks. */
  restockSeconds: 300,
  /** Items on the shelf. */
  stockSize: 3,
  /** Most items one player may own. */
  maxOwned: 3,
  /** Most items one player may have equipped. */
  maxEquipped: 3,
} as const;

export const itemById = (id: string): ItemDefinition | undefined =>
  ITEM_POOL.find((item) => item.id === id);

/** The restock slot a wall-clock time falls in. */
export const shopSlotAt = (nowMs: number): number =>
  Math.floor(Math.max(0, nowMs) / (SHOP.restockSeconds * 1000));

/** Seconds until the next restock. */
export const shopSecondsLeft = (nowMs: number): number => {
  const period = SHOP.restockSeconds * 1000;
  return Math.ceil((period - (Math.max(0, nowMs) % period)) / 1000);
};

/** Deterministic PRNG, so every room and client rolls the same shelf. */
const mulberry = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** The shelf for a restock slot: `SHOP.stockSize` distinct items. */
export const stockForSlot = (slot: number): readonly ItemDefinition[] => {
  const random = mulberry(Math.floor(slot) * 2654435761 + 97);
  const rarities = Object.keys(RARITIES) as Rarity[];
  const total = rarities.reduce((sum, rarity) => sum + RARITIES[rarity].weight, 0);
  const picked: ItemDefinition[] = [];

  for (let attempt = 0; picked.length < SHOP.stockSize && attempt < 64; attempt += 1) {
    let roll = random() * total;
    let rarity: Rarity = 'Common';
    for (const candidate of rarities) {
      roll -= RARITIES[candidate].weight;
      if (roll <= 0) {
        rarity = candidate;
        break;
      }
    }
    const options = ITEM_POOL.filter(
      (item) => item.rarity === rarity && !picked.includes(item),
    );
    const choice = options[Math.floor(random() * options.length)];
    if (choice) picked.push(choice);
  }
  return picked;
};

/** One backpack entry. */
export interface OwnedItem {
  readonly id: string;
  readonly equipped: boolean;
}

/**
 * The backpack travels as ONE string, e.g. `"fossil*,crystal"` (`*` marks
 * equipped). A single replicated field changes the player's own onChange,
 * where a nested schema array would not, and it persists as-is.
 */
export const parseEquipment = (encoded: string): OwnedItem[] => {
  if (typeof encoded !== 'string' || encoded.length === 0) return [];
  const out: OwnedItem[] = [];
  for (const part of encoded.split(',')) {
    const equipped = part.endsWith('*');
    const id = equipped ? part.slice(0, -1) : part;
    if (!itemById(id) || out.length >= SHOP.maxOwned) continue;
    out.push({ id, equipped });
  }
  // Never more equipped than allowed, whatever the source string said.
  let equippedCount = 0;
  return out.map((item) => {
    if (!item.equipped) return item;
    equippedCount += 1;
    return equippedCount <= SHOP.maxEquipped ? item : { id: item.id, equipped: false };
  });
};

export const encodeEquipment = (items: readonly OwnedItem[]): string =>
  items.map((item) => `${item.id}${item.equipped ? '*' : ''}`).join(',');

/** Sum of height bonuses from EQUIPPED items, in percent. */
export const equipmentHeightBonus = (encoded: string): number =>
  parseEquipment(encoded).reduce(
    (sum, item) => sum + (item.equipped ? itemById(item.id)?.heightBonus ?? 0 : 0),
    0,
  );

/** Equip the best `SHOP.maxEquipped` owned items, unequip the rest. */
export const equipBest = (items: readonly OwnedItem[]): OwnedItem[] => {
  const ranked = items
    .map((item, index) => ({ index, bonus: itemById(item.id)?.heightBonus ?? 0 }))
    .sort((a, b) => b.bonus - a.bonus)
    .slice(0, SHOP.maxEquipped)
    .map((entry) => entry.index);
  return items.map((item, index) => ({ id: item.id, equipped: ranked.includes(index) }));
};
