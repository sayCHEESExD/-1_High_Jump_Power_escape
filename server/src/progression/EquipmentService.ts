import {
  SHOP,
  encodeEquipment,
  equipBest,
  inShopZone,
  parseEquipment,
  stockForSlot,
} from '@highjump/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { EnergyService } from './EnergyService.js';
import { wallet } from './Wallet.js';

export type ItemRefusal =
  | 'bad-index'
  | 'not-at-shop'
  | 'sold-out'
  | 'backpack-full'
  | 'too-poor'
  | 'equip-limit';

/**
 * Server authority over the item shop and the backpack.
 *
 * The shelf is `stockForSlot(shopSlot)`, computed from the SERVER's clock, so a
 * client cannot name an item that is not on sale. A player may buy each shelf
 * item once per restock, must be standing at the stall, and may own at most
 * `SHOP.maxOwned` items. Payment is the last check.
 */
export class EquipmentService {
  buy(player: PlayerState, index: number, shopSlot: number, energy: EnergyService): ItemRefusal | null {
    const at = Math.floor(index);
    const item = stockForSlot(shopSlot)[at];
    if (!item || at < 0) return 'bad-index';
    if (!inShopZone(player.x, player.y, player.z)) return 'not-at-shop';

    if (player.shopBoughtSlot !== shopSlot) {
      player.shopBoughtSlot = shopSlot;
      player.shopBoughtMask = 0;
    }
    if ((player.shopBoughtMask & (1 << at)) !== 0) return 'sold-out';

    const items = parseEquipment(player.equipment);
    if (items.length >= SHOP.maxOwned) return 'backpack-full';
    if (!wallet.spend(player, item.price)) return 'too-poor';

    const equippedCount = items.filter((entry) => entry.equipped).length;
    items.push({ id: item.id, equipped: equippedCount < SHOP.maxEquipped });
    player.equipment = encodeEquipment(items);
    player.shopBoughtMask |= 1 << at;
    energy.syncDerived(player);
    return null;
  }

  equipBest(player: PlayerState, energy: EnergyService): void {
    player.equipment = encodeEquipment(equipBest(parseEquipment(player.equipment)));
    energy.syncDerived(player);
  }

  toggle(player: PlayerState, index: number, energy: EnergyService): ItemRefusal | null {
    const items = parseEquipment(player.equipment);
    const target = items[Math.floor(index)];
    if (!target) return 'bad-index';
    if (!target.equipped && items.filter((item) => item.equipped).length >= SHOP.maxEquipped) {
      return 'equip-limit';
    }
    items[Math.floor(index)] = { id: target.id, equipped: !target.equipped };
    player.equipment = encodeEquipment(items);
    energy.syncDerived(player);
    return null;
  }

  remove(player: PlayerState, index: number, energy: EnergyService): ItemRefusal | null {
    const items = parseEquipment(player.equipment);
    if (!items[Math.floor(index)]) return 'bad-index';
    items.splice(Math.floor(index), 1);
    player.equipment = encodeEquipment(items);
    energy.syncDerived(player);
    return null;
  }
}
