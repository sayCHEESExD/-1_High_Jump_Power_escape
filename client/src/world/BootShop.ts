import {
  BOOT_SHOP,
  BOOT_TIERS,
  HUB,
  bestOwnedBoot,
  bootPadCentre,
  formatNumber,
  isBootOwned,
} from '@highjump/shared';
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  type BufferGeometry,
} from 'three';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign, type SignLine } from './CanvasSign.js';
import { FramedSign, SIGN_THEMES } from './FramedSign.js';

/**
 * The Wins Shop: ten spring boots on pedestals, two rows of five down the
 * player's LEFT (+X). Walk onto a pad holding the Wins to buy that boot.
 *
 * All boots share two geometries (a shoe and a spring coil); only the material
 * colour differs. Signs redraw only when ownership or affordability changes.
 */
export class BootShop {
  readonly root = new Group();
  private readonly pads: Mesh[] = [];
  private readonly models: Group[] = [];
  private readonly signs: CanvasSign[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshLambertMaterial[] = [];
  private readonly padOwned: MeshLambertMaterial;
  private readonly padOpen: MeshLambertMaterial;
  private signature = '';
  private time = 0;
  private readonly title: FramedSign;

  constructor() {
    const shoe = new BoxGeometry(0.9, 0.7, 1.5);
    const coil = new CylinderGeometry(0.32, 0.32, 0.9, 8, 3, true);
    const pad = new BoxGeometry(BOOT_SHOP.padSize, BOOT_SHOP.padTop, BOOT_SHOP.padSize);
    this.geometries.push(shoe, coil, pad);
    this.padOwned = this.lambert(PALETTE.bootPadOwned);
    this.padOpen = this.lambert(PALETTE.bootPad);
    const spring = this.lambert(0x2b2f3a);

    for (const tier of BOOT_TIERS) {
      const centre = bootPadCentre(tier.slot);
      const padMesh = new Mesh(pad, this.padOpen);
      padMesh.position.set(centre.x, HUB.floorY + BOOT_SHOP.padTop / 2, centre.z);
      padMesh.receiveShadow = true;
      this.root.add(padMesh);
      this.pads.push(padMesh);

      const model = new Group();
      const colour = this.lambert(tier.color);
      for (const side of [-0.6, 0.6]) {
        const body = new Mesh(shoe, colour);
        body.position.set(side, 1.1, 0);
        const springMesh = new Mesh(coil, spring);
        springMesh.position.set(side, 0.35, 0);
        body.castShadow = true;
        model.add(body, springMesh);
      }
      model.position.set(centre.x, HUB.floorY + 1.2, centre.z);
      model.scale.setScalar(1.3);
      this.root.add(model);
      this.models.push(model);

      const row = Math.floor((tier.slot - 1) / BOOT_SHOP.perRow);
      const sign = new CanvasSign(8, 3.6, this.lines(tier.slot, 0, 0));
      sign.mesh.position.set(centre.x - 1, HUB.floorY + 5.5 + row * 2.4, centre.z);
      sign.mesh.rotation.y = -Math.PI / 2;
      this.root.add(sign.mesh);
      this.signs.push(sign);
    }

    // The landmark: trophy in front of the name, gold frame, golden glow.
    this.title = new FramedSign(38, 10, 'Wins Shop', '/ui/trophy.png', SIGN_THEMES.gold);
    this.title.root.position.set(HUB.halfWidth - 0.35, 16.5, BOOT_SHOP.firstZ + BOOT_SHOP.spacingZ * 2);
    this.title.root.rotation.y = -Math.PI / 2;
    this.root.add(this.title.root);
  }

  setInventory(ownedBoots: number, wins: number): void {
    const affordable = BOOT_TIERS.map((tier) => (wins >= tier.cost ? 1 : 0)).join('');
    const signature = `${ownedBoots}|${affordable}`;
    if (signature === this.signature) return;
    this.signature = signature;
    BOOT_TIERS.forEach((tier, index) => {
      const pad = this.pads[index];
      if (pad) pad.material = isBootOwned(ownedBoots, tier.slot) ? this.padOwned : this.padOpen;
      this.signs[index]?.redraw(this.lines(tier.slot, ownedBoots, wins));
    });
  }

  update(delta: number): void {
    this.time += delta;
    this.title.update(delta);
    this.models.forEach((model, index) => {
      model.rotation.y = this.time * 0.9 + index;
      model.position.y = HUB.floorY + 1.2 + Math.sin(this.time * 2 + index) * 0.25;
    });
  }

  private lines(slot: number, owned: number, wins: number): SignLine[] {
    const tier = BOOT_TIERS[slot - 1];
    if (!tier) return [];
    const status = isBootOwned(owned, slot)
      ? bestOwnedBoot(owned)?.slot === slot
        ? { text: 'Equipped', fill: '#7dff5c' }
        : { text: 'Owned', fill: '#bfe8ff' }
      : { text: `Need ${formatNumber(tier.cost)}`, fill: wins >= tier.cost ? '#ffe14d' : '#ff9a3d' };
    return [
      { text: `+${formatNumber(tier.energyPerStep)}/Step`, size: 1, fill: '#ffffff', stroke: '#1b2433', strokeWidth: 0.18 },
      { text: status.text, size: 0.9, fill: status.fill, stroke: '#1b2433', strokeWidth: 0.18 },
    ];
  }

  private lambert(color: number): MeshLambertMaterial {
    const material = new MeshLambertMaterial({ color });
    this.materials.push(material);
    return material;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const sign of this.signs) sign.dispose();
    this.title.dispose();
    this.root.removeFromParent();
  }
}
