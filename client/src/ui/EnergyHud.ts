import { energyForNextLevel, formatNumber } from '@highjump/shared';
import { ICONS, injectHudStyles } from './hudStyles.js';

/**
 * The bottom HUD: Height and Jumps above the bar, Rebirth to the right, and the
 * level bar showing energy banked toward the next level.
 *
 * Renders replicated server state only, and writes to the DOM only on change.
 */
export class EnergyHud {
  private readonly root: HTMLDivElement;
  private readonly height: HTMLDivElement;
  private readonly jumps: HTMLDivElement;
  private readonly rebirth: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly level: HTMLDivElement;
  private readonly amount: HTMLSpanElement;
  private last = '';
  private lastLevel = -1;

  constructor(parent: HTMLElement) {
    injectHudStyles();
    this.root = document.createElement('div');
    this.root.className = 'hj-hud hj-font';
    this.root.innerHTML =
      '<div class="hj-hud__row"><div><div class="hj-hud__height hj-outline"></div>' +
      '<div class="hj-hud__jumps hj-outline"></div></div><div class="hj-hud__rebirth"></div></div>' +
      '<div class="hj-hud__bar"><div class="hj-hud__fill"></div>' +
      '<div class="hj-hud__level hj-outline"></div>' +
      `<div class="hj-hud__amount hj-outline">${ICONS.energy}<span></span></div></div>`;
    this.height = this.root.querySelector('.hj-hud__height') as HTMLDivElement;
    this.jumps = this.root.querySelector('.hj-hud__jumps') as HTMLDivElement;
    this.rebirth = this.root.querySelector('.hj-hud__rebirth') as HTMLDivElement;
    this.fill = this.root.querySelector('.hj-hud__fill') as HTMLDivElement;
    this.level = this.root.querySelector('.hj-hud__level') as HTMLDivElement;
    this.amount = this.root.querySelector('.hj-hud__amount span') as HTMLSpanElement;
    parent.appendChild(this.root);
  }

  update(level: number, energy: number, rebirths: number, height: number, maxJumps: number, jumpsLeft: number): void {
    const required = energyForNextLevel(level, rebirths);
    const signature = `${level}|${Math.floor(energy)}|${rebirths}|${height.toFixed(1)}|${maxJumps}|${jumpsLeft}`;
    if (signature === this.last) return;
    this.last = signature;

    this.height.textContent = `Height: ${formatNumber(Math.floor(height))}`;
    this.jumps.textContent = `Jumps: ${jumpsLeft}/${maxJumps}`;
    this.rebirth.textContent = `Rebirth: ${rebirths}`;
    this.level.textContent = `Level ${level}`;
    this.amount.textContent = `${formatNumber(energy)}/${formatNumber(required)}`;
    this.fill.style.width = `${Math.min(100, Math.max(0, (energy / required) * 100)).toFixed(2)}%`;

    if (this.lastLevel >= 0 && level > this.lastLevel) {
      this.root.classList.remove('hj-hud--levelup');
      void this.root.offsetWidth;
      this.root.classList.add('hj-hud--levelup');
    }
    this.lastLevel = level;
  }

  dispose(): void {
    this.root.remove();
  }
}
