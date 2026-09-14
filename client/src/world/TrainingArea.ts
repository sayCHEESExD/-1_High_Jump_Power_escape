import { HUB, TRAINING, TREADMILL_TIERS } from '@highjump/shared';
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  type BufferGeometry,
  type Texture,
} from 'three';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign, type SignLine } from './CanvasSign.js';
import { texturedBox } from './texturedBox.js';
import type { WorldTextures } from './WorldTextures.js';

const BELT_SCROLL = 1.4;

/**
 * High Training: four treadmills along the back of the hub, each gated by a
 * rebirth count (Beginner, 1, 2, 4 Rebirth) and paying more energy per step.
 *
 * Belts run along Z with the console at the back (-Z), so a runner faces the
 * back wall as in the reference. The belts are real solids in shared data; all
 * of this is the machine around them.
 */
export class TrainingArea {
  readonly root = new Group();
  private readonly belts: Mesh[] = [];
  private readonly signs: CanvasSign[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: (MeshLambertMaterial | MeshBasicMaterial)[] = [];
  private readonly beltTexture: Texture;
  private rebirths = -1;
  private time = 0;

  constructor(textures: WorldTextures) {
    const frame = this.lambert(PALETTE.treadmillFrame);
    const frameDark = this.lambert(PALETTE.treadmillFrameDark);
    const screen = this.lambert(PALETTE.treadmillScreen);
    this.beltTexture = textures.belt('#1a1f2b', '#ffd23d').clone();
    this.beltTexture.needsUpdate = true;
    const beltMaterial = this.lambert(0xffffff);
    beltMaterial.map = this.beltTexture;

    const L = TRAINING.beltLength;
    const W = TRAINING.beltWidth;
    const deck = this.box(W + 1.4, TRAINING.deckTop, L + 1.6);
    const belt = this.box(W - 2, 0.06, L - 1.2);
    const rail = this.box(1, 0.9, L + 1.6);
    const post = this.box(0.8, 4.2, 0.8);
    const panel = this.box(W - 1, 2.2, 1);
    const face = this.box(W - 2.6, 1.4, 0.3);
    const handle = this.box(0.6, 0.6, 4);
    const strip = new PlaneGeometry(0.5, L + 1.6);
    this.geometries.push(strip);

    TREADMILL_TIERS.forEach((tier, index) => {
      const machine = new Group();
      machine.position.set(TRAINING.xs[index] ?? 0, HUB.floorY, TRAINING.centerZ);

      this.add(machine, deck, frame, 0, TRAINING.deckTop / 2, 0);
      const surface = this.add(machine, belt, beltMaterial, 0, TRAINING.deckTop + 0.03, 0);
      this.belts.push(surface);
      for (const side of [-1, 1]) {
        this.add(machine, rail, frameDark, side * (W / 2 + 0.2), 0.45, 0);
        this.add(machine, post, frame, side * (W / 2 - 0.6), 2.1, -(L / 2 - 0.4));
        this.add(machine, handle, frameDark, side * (W / 2 - 0.6), 3.4, -(L / 2 - 2.4));
        const glow = new Mesh(
          strip,
          new MeshBasicMaterial({ color: tier.glow, transparent: true, opacity: 0.85, side: DoubleSide }),
        );
        this.materials.push(glow.material as MeshBasicMaterial);
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(side * (W / 2 + 0.95), 0.05, 0);
        machine.add(glow);
      }
      this.add(machine, panel, frame, 0, 4.2, -(L / 2 - 0.4));
      this.add(machine, face, screen, 0, 4.3, -(L / 2 - 0.95));

      const sign = new CanvasSign(12, 5.4, this.lines(index, 0));
      sign.mesh.position.set(0, 8.6, -(L / 2 - 0.4));
      machine.add(sign.mesh);
      this.signs.push(sign);

      this.root.add(machine);
    });

    const title = new CanvasSign(44, 8, [
      { text: 'High Training', size: 1, fill: '#ff5ff0', stroke: '#3a0a4a', strokeWidth: 0.2 },
    ]);
    title.mesh.position.set(0, 19, HUB.minZ + 0.2);
    this.root.add(title.mesh);
    this.signs.push(title);
    this.setRebirths(0);
  }

  /** Redraw the gate lines when the player's rebirth count changes. */
  setRebirths(rebirths: number): void {
    if (rebirths === this.rebirths) return;
    this.rebirths = rebirths;
    TREADMILL_TIERS.forEach((_tier, index) => this.signs[index]?.redraw(this.lines(index, rebirths)));
  }

  update(delta: number): void {
    this.time += delta;
    // The belt travels toward the back of the machine, under a runner facing it.
    this.beltTexture.offset.y = (this.time * BELT_SCROLL) % 1;
  }

  private lines(index: number, rebirths: number): SignLine[] {
    const tier = TREADMILL_TIERS[index];
    if (!tier) return [];
    const locked = rebirths < tier.rebirthsRequired;
    return [
      { text: tier.name, size: 0.8, fill: '#ffffff', stroke: '#0a0f1a', strokeWidth: 0.16 },
      { text: `x${tier.multiplier} Step`, size: 1, fill: '#ffe14d', stroke: '#2a2006', strokeWidth: 0.17 },
      locked
        ? { text: `LOCKED`, size: 0.7, fill: '#ff5a5a', stroke: '#2a0606', strokeWidth: 0.16 }
        : { text: 'UNLOCKED', size: 0.7, fill: '#7dff9e', stroke: '#06240f', strokeWidth: 0.16 },
    ];
  }

  private box(w: number, h: number, d: number): BufferGeometry {
    const geometry = texturedBox(w, h, d, 2);
    this.geometries.push(geometry);
    return geometry;
  }

  private lambert(color: number): MeshLambertMaterial {
    const material = new MeshLambertMaterial({ color });
    this.materials.push(material);
    return material;
  }

  private add(
    parent: Group,
    geometry: BufferGeometry,
    material: MeshLambertMaterial,
    x: number,
    y: number,
    z: number,
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const sign of this.signs) sign.dispose();
    this.beltTexture.dispose();
    this.root.removeFromParent();
  }
}
