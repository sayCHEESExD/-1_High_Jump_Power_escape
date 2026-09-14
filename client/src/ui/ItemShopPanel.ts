import {
  RARITIES,
  SHOP,
  formatNumber,
  parseEquipment,
  stockForSlot,
  type ItemDefinition,
} from '@highjump/shared';
import { ICONS } from './hudStyles.js';
import { Panel } from './Panel.js';

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/**
 * The Item Shop, opened by walking up to the equipment stall.
 *
 * Three cards from the current restock (a pure function of the server's
 * restock slot) and a countdown to the next one. Each card's button ASKS the
 * server, which re-checks the shelf, the stall position, the backpack space and
 * the Wins.
 */
export class ItemShopPanel extends Panel {
  private readonly timer: HTMLSpanElement;
  private readonly cards: HTMLDivElement;
  private readonly note: HTMLParagraphElement;
  private slot = -1;
  private remaining = 0;
  private lastTimerText = '';
  private signature = '';
  private stock: readonly ItemDefinition[] = [];
  private wins = 0;
  private equipment = '';
  private boughtSlot = -1;
  private boughtMask = 0;
  private atShop = false;
  private readonly buttons: HTMLButtonElement[] = [];

  constructor(parent: HTMLElement, private readonly onBuy: (index: number) => void) {
    super(parent, 'shop', 'Item Shop', ICONS.shop);
    const top = document.createElement('div');
    top.className = 'hj-shop__top hj-font hj-outline';
    this.timer = document.createElement('span');
    top.appendChild(this.timer);
    this.cards = document.createElement('div');
    this.cards.className = 'hj-shop__cards';
    this.note = document.createElement('p');
    this.note.className = 'hj-shop__note';
    this.body.append(top, this.cards, this.note);
  }

  /** Mirror everything the cards depend on. Cheap when nothing changed. */
  sync(
    slot: number,
    remaining: number,
    wins: number,
    equipment: string,
    boughtSlot: number,
    boughtMask: number,
    atShop: boolean,
  ): void {
    if (slot !== this.slot) {
      this.slot = slot;
      this.stock = stockForSlot(slot);
      this.buildCards();
    }
    if (Math.abs(remaining - this.remaining) >= 1 || remaining > this.remaining) this.remaining = remaining;

    const signature = `${Math.floor(wins)}|${equipment}|${boughtSlot}|${boughtMask}|${atShop}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.wins = wins;
      this.equipment = equipment;
      this.boughtSlot = boughtSlot;
      this.boughtMask = boughtMask;
      this.atShop = atShop;
      this.renderButtons();
    }
  }

  /** Count down locally between whole-second patches. */
  tick(delta: number): void {
    if (!this.isOpen) return;
    this.remaining = Math.max(0, this.remaining - delta);
    const total = Math.ceil(this.remaining);
    const text = `Restocks in ${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
    if (text !== this.lastTimerText) {
      this.lastTimerText = text;
      this.timer.textContent = text;
    }
  }

  private buildCards(): void {
    this.cards.textContent = '';
    this.buttons.length = 0;
    this.stock.forEach((item, index) => {
      const rarity = RARITIES[item.rarity];
      const card = document.createElement('div');
      card.className = 'hj-card hj-font';
      card.style.background = `linear-gradient(180deg, ${rarity.color}, #1f2937)`;
      card.innerHTML =
        '<div class="hj-card__rarity hj-outline"></div><div class="hj-card__gem"></div>' +
        '<div class="hj-card__name hj-outline"></div><div class="hj-card__bonus hj-outline"></div>';
      (card.querySelector('.hj-card__rarity') as HTMLDivElement).textContent = item.rarity;
      (card.querySelector('.hj-card__gem') as HTMLDivElement).style.background = hex(item.color);
      (card.querySelector('.hj-card__name') as HTMLDivElement).textContent = item.name;
      (card.querySelector('.hj-card__bonus') as HTMLDivElement).textContent = `+${item.heightBonus}% Height`;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hj-btn hj-btn--wins hj-font';
      button.addEventListener('click', () => {
        if (!button.disabled) this.onBuy(index);
      });
      card.appendChild(button);
      this.cards.appendChild(card);
      this.buttons.push(button);
    });
    this.signature = '';
  }

  private renderButtons(): void {
    const full = parseEquipment(this.equipment).length >= SHOP.maxOwned;
    this.stock.forEach((item, index) => {
      const button = this.buttons[index];
      if (!button) return;
      const sold = this.boughtSlot === this.slot && (this.boughtMask & (1 << index)) !== 0;
      if (sold) {
        button.textContent = 'SOLD';
        button.disabled = true;
        return;
      }
      button.innerHTML = `${ICONS.trophy}<span>${formatNumber(item.price)}</span>`;
      button.disabled = full || !this.atShop || this.wins < item.price;
    });
    this.note.textContent = !this.atShop
      ? 'Walk up to the Equipment Shop to buy.'
      : full
        ? `Backpack full (${SHOP.maxOwned}/${SHOP.maxOwned}) - delete an item to buy more.`
        : 'Items boost your jump height while equipped.';
  }
}
