import {
  canRebirth,
  maxJumpsForRebirth,
  rebirthCostMultiplier,
  rebirthRequiredLevel,
} from '@highjump/shared';
import { ICONS } from './hudStyles.js';
import { Panel } from './Panel.js';

/**
 * The rebirth confirmation, laid out as the reference: current rebirth on the
 * left, next on the right, the energy multiplier and jump count side by side,
 * the reset stated in red, and a progress bar to the required level.
 *
 * The button only ASKS; the server decides.
 */
export class RebirthPanel extends Panel {
  private readonly headNow: HTMLSpanElement;
  private readonly headNext: HTMLSpanElement;
  private readonly costNow: HTMLDivElement;
  private readonly costNext: HTMLDivElement;
  private readonly jumpsNow: HTMLDivElement;
  private readonly jumpsNext: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly barLabel: HTMLSpanElement;
  private readonly action: HTMLButtonElement;
  private level = 1;
  private rebirths = 0;

  constructor(parent: HTMLElement, onRebirth: () => void) {
    super(parent, 'rebirth', 'Rebirth', ICONS.rebirth);
    const grid = document.createElement('div');
    grid.className = 'hj-rb hj-font';
    grid.innerHTML =
      '<span class="hj-rb__head hj-outline"></span><span></span><span class="hj-rb__head hj-outline"></span>' +
      '<div class="hj-rb__card hj-outline"></div><span class="hj-rb__arrow hj-font">&gt;&gt;</span><div class="hj-rb__card hj-outline"></div>' +
      '<div class="hj-rb__card hj-outline"></div><span class="hj-rb__arrow hj-font">&gt;&gt;</span><div class="hj-rb__card hj-outline"></div>';
    const heads = grid.querySelectorAll<HTMLSpanElement>('.hj-rb__head');
    const cards = grid.querySelectorAll<HTMLDivElement>('.hj-rb__card');
    this.headNow = heads[0] as HTMLSpanElement;
    this.headNext = heads[1] as HTMLSpanElement;
    this.costNow = cards[0] as HTMLDivElement;
    this.costNext = cards[1] as HTMLDivElement;
    this.jumpsNow = cards[2] as HTMLDivElement;
    this.jumpsNext = cards[3] as HTMLDivElement;

    const warn = document.createElement('p');
    warn.className = 'hj-rb__warn';
    warn.textContent = 'Rebirth resets your level and energy, but gives permanent extra jumps.';

    const bar = document.createElement('div');
    bar.className = 'hj-rb__bar hj-font';
    this.fill = document.createElement('div');
    this.fill.className = 'hj-rb__fill';
    this.barLabel = document.createElement('span');
    this.barLabel.className = 'hj-rb__barlabel hj-outline';
    bar.append(this.fill, this.barLabel);

    const actions = document.createElement('div');
    actions.className = 'hj-rb__actions';
    this.action = document.createElement('button');
    this.action.type = 'button';
    this.action.className = 'hj-btn hj-btn--gold hj-font';
    this.action.textContent = 'Rebirth';
    this.action.addEventListener('click', () => {
      if (this.action.disabled) return;
      onRebirth();
      this.setOpen(false);
    });
    actions.appendChild(this.action);

    this.body.append(grid, warn, bar, actions);
    this.render();
  }

  get isEligible(): boolean {
    return canRebirth(this.level, this.rebirths);
  }

  setProgress(level: number, rebirths: number): void {
    if (level === this.level && rebirths === this.rebirths) return;
    this.level = level;
    this.rebirths = rebirths;
    this.render();
  }

  protected override onOpened(): void {
    this.render();
  }

  private render(): void {
    const r = this.rebirths;
    const required = rebirthRequiredLevel(r);
    this.headNow.textContent = `Rebirth ${r}`;
    this.headNext.textContent = `Rebirth ${r + 1}`;
    this.costNow.textContent = `Energy Cost x${rebirthCostMultiplier(r)}`;
    this.costNext.textContent = `Energy Cost x${rebirthCostMultiplier(r + 1)}`;
    const jumps = (n: number): string => `${n} Jump${n === 1 ? '' : 's'}`;
    this.jumpsNow.textContent = jumps(maxJumpsForRebirth(r));
    this.jumpsNext.textContent = jumps(maxJumpsForRebirth(r + 1));
    const shown = Math.min(this.level, required);
    this.fill.style.width = `${(shown / required) * 100}%`;
    this.barLabel.textContent = `LV.${shown}/LV.${required}`;
    this.action.disabled = !this.isEligible;
    this.action.textContent = this.isEligible ? 'Rebirth' : `Reach Level ${required}`;
  }
}
