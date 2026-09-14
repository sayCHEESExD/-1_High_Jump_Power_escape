import {
  BOOT_TIERS,
  RARITIES,
  SHOP,
  bestOwnedBoot,
  isBootOwned,
  itemById,
  parseEquipment,
} from '@highjump/shared';
import { ICONS, iconUrl } from './hudStyles.js';
import { Panel } from './Panel.js';

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

export interface BackpackActions {
  equipBest(): void;
  toggle(index: number): void;
  remove(index: number): void;
}

/**
 * The Backpack: owned equipment (at most three) and owned boots.
 *
 * Select an item to equip/unequip or delete it; Best Equip wears the best
 * three. Delete needs a second click to confirm. Every action only asks.
 */
export class BackpackPanel extends Panel {
  private readonly title: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly bestButton: HTMLButtonElement;
  private readonly actionsRow: HTMLDivElement;
  private readonly tabs = new Map<'equipment' | 'shoes', HTMLButtonElement>();
  private tab: 'equipment' | 'shoes' = 'equipment';
  private equipment = '';
  private ownedBoots = 0;
  private selected = -1;
  private confirmDelete = false;

  constructor(parent: HTMLElement, private readonly actions: BackpackActions) {
    super(parent, 'backpack', 'Backpack', ICONS.backpack);

    const tabs = document.createElement('div');
    tabs.className = 'hj-bp__tabs';
    const addTab = (key: 'equipment' | 'shoes', label: string, image: string): void => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hj-bp__tab hj-font';
      button.innerHTML = `${image}<span class="hj-outline"></span>`;
      (button.querySelector('span') as HTMLSpanElement).textContent = label;
      button.addEventListener('click', () => {
        this.tab = key;
        this.selected = -1;
        this.render();
      });
      tabs.appendChild(button);
      this.tabs.set(key, button);
    };
    addTab('equipment', 'Equipment', '<span style="font-size:30px">\u{1F48E}</span>');
    addTab('shoes', 'Shoes', `<img src="${iconUrl('shoe.png')}" alt="">`);

    const frame = document.createElement('div');
    frame.className = 'hj-bp__frame';
    this.title = document.createElement('div');
    this.title.className = 'hj-bp__title hj-font hj-outline';
    this.grid = document.createElement('div');
    this.grid.className = 'hj-bp__grid';
    frame.append(this.title, this.grid);

    this.actionsRow = document.createElement('div');
    this.actionsRow.className = 'hj-bp__actions';
    this.bestButton = this.button('Best Equip', 'hj-btn--gold', () => actions.equipBest());
    this.toggleButton = this.button('Equip', 'hj-btn--blue', () => {
      if (this.selected >= 0) actions.toggle(this.selected);
    });
    this.deleteButton = this.button('Delete', 'hj-btn--red', () => {
      if (this.selected < 0) return;
      if (!this.confirmDelete) {
        this.confirmDelete = true;
        this.render();
        return;
      }
      actions.remove(this.selected);
      this.selected = -1;
      this.confirmDelete = false;
    });
    this.actionsRow.append(this.bestButton, this.toggleButton, this.deleteButton);

    this.body.append(tabs, frame, this.actionsRow);
    this.render();
  }

  setInventory(equipment: string, ownedBoots: number): void {
    if (equipment === this.equipment && ownedBoots === this.ownedBoots) return;
    if (parseEquipment(equipment).length !== parseEquipment(this.equipment).length) {
      this.selected = -1;
      this.confirmDelete = false;
    }
    this.equipment = equipment;
    this.ownedBoots = ownedBoots;
    this.render();
  }

  protected override onOpened(): void {
    this.confirmDelete = false;
    this.render();
  }

  private button(label: string, variant: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `hj-btn ${variant} hj-font`;
    button.textContent = label;
    button.addEventListener('click', () => {
      if (!button.disabled) onClick();
    });
    return button;
  }

  private render(): void {
    for (const [key, button] of this.tabs) button.classList.toggle('hj-bp__tab--on', key === this.tab);
    this.grid.textContent = '';

    if (this.tab === 'shoes') {
      this.actionsRow.hidden = true;
      const best = bestOwnedBoot(this.ownedBoots);
      const owned = BOOT_TIERS.filter((tier) => isBootOwned(this.ownedBoots, tier.slot));
      this.title.textContent = `Shoes (${owned.length}/${BOOT_TIERS.length})`;
      if (owned.length === 0) this.empty('Buy spring boots in the Wins Shop.');
      for (const tier of owned) {
        const card = this.card(tier.name, hex(tier.color), `+${tier.energyPerStep}/Step`, 'Common');
        if (best?.slot === tier.slot) this.badge(card, 'Worn');
        this.grid.appendChild(card);
      }
      return;
    }

    this.actionsRow.hidden = false;
    const items = parseEquipment(this.equipment);
    this.title.textContent = `Equipment (${items.length}/${SHOP.maxOwned})`;
    if (items.length === 0) this.empty('Buy items at the Equipment Shop by the stairs.');
    items.forEach((entry, index) => {
      const item = itemById(entry.id);
      if (!item) return;
      const card = this.card(item.name, hex(item.color), `+${item.heightBonus}% Height`, item.rarity);
      card.classList.add('hj-bp__item');
      if (entry.equipped) this.badge(card, 'Equipped');
      if (index === this.selected) card.classList.add('hj-bp__item--sel');
      card.addEventListener('click', () => {
        this.selected = index === this.selected ? -1 : index;
        this.confirmDelete = false;
        this.render();
      });
      this.grid.appendChild(card);
    });

    const chosen = items[this.selected];
    this.bestButton.disabled = items.length === 0;
    this.toggleButton.disabled = !chosen;
    this.toggleButton.textContent = chosen?.equipped ? 'Unequip' : 'Equip';
    this.deleteButton.disabled = !chosen;
    this.deleteButton.textContent = this.confirmDelete ? 'Confirm Delete' : 'Delete';
  }

  private card(name: string, color: string, bonus: string, rarity: keyof typeof RARITIES): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'hj-card hj-font';
    card.style.background = `linear-gradient(180deg, ${RARITIES[rarity].color}, #1f2937)`;
    card.innerHTML =
      '<div class="hj-card__gem"></div><div class="hj-card__name hj-outline"></div><div class="hj-card__bonus hj-outline"></div>';
    (card.querySelector('.hj-card__gem') as HTMLDivElement).style.background = color;
    (card.querySelector('.hj-card__name') as HTMLDivElement).textContent = name;
    (card.querySelector('.hj-card__bonus') as HTMLDivElement).textContent = bonus;
    return card;
  }

  private badge(card: HTMLDivElement, text: string): void {
    const badge = document.createElement('span');
    badge.className = 'hj-bp__equipped hj-outline';
    badge.textContent = text;
    card.style.position = 'relative';
    card.appendChild(badge);
  }

  private empty(text: string): void {
    const note = document.createElement('p');
    note.className = 'hj-bp__empty';
    note.textContent = text;
    this.grid.appendChild(note);
  }
}
