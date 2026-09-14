import { EQUIPMENT_STALL, HUB } from '@highjump/shared';
import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign } from './CanvasSign.js';
import type { WorldTextures } from './WorldTextures.js';

/**
 * The Equipment Shop stall at the foot of the staircase: a counter, a striped
 * awning, lollipops and a floor marker showing where to stand. Standing in
 * that zone opens the Item Shop (decided by shared `inShopZone`).
 */
export class EquipmentStall {
  readonly root = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly sign: CanvasSign;
  private readonly marker: Mesh;

  constructor(textures: WorldTextures) {
    const s = EQUIPMENT_STALL;
    const counterMat = this.track(new MeshLambertMaterial({ map: textures.studs('#f5f7fb', '#d6dde8') }));
    const wood = this.track(new MeshLambertMaterial({ color: PALETTE.stallWood }));
    const stripeA = this.track(new MeshLambertMaterial({ color: PALETTE.stallAwningA }));
    const stripeB = this.track(new MeshLambertMaterial({ color: PALETTE.stallAwningB }));

    this.add(new BoxGeometry(s.width, s.height, s.depth), counterMat, s.x, s.height / 2, s.z);
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        this.add(new BoxGeometry(0.8, 8, 0.8), wood, s.x + dx * (s.width / 2 - 0.4), 4, s.z + dz * (s.depth / 2 + 1));
      }
    }
    const stripes = 6;
    const stripeW = (s.width + 2) / stripes;
    for (let i = 0; i < stripes; i += 1) {
      const stripe = this.add(
        new BoxGeometry(stripeW, 0.5, s.depth + 5),
        i % 2 === 0 ? stripeA : stripeB,
        s.x - (s.width + 2) / 2 + stripeW * (i + 0.5),
        8.6,
        s.z - 0.6,
      );
      stripe.rotation.x = -0.22;
    }

    // Lollipops either side.
    const stick = new CylinderGeometry(0.15, 0.15, 4, 6);
    const candy = new CylinderGeometry(1.6, 1.6, 0.5, 16);
    this.geometries.push(stick, candy);
    const candyMats = [0xff4fa3, 0x4fb8ff].map((color) => this.track(new MeshLambertMaterial({ color })));
    [-1, 1].forEach((side, index) => {
      const x = s.x + side * (s.width / 2 + 2.5);
      const stickMesh = new Mesh(stick, stripeB);
      stickMesh.position.set(x, 2, s.z - 1);
      const head = new Mesh(candy, candyMats[index] ?? stripeA);
      head.position.set(x, 5.2, s.z - 1);
      head.rotation.x = Math.PI / 2;
      this.root.add(stickMesh, head);
    });

    const zone = s.zone;
    const markerGeometry = new PlaneGeometry(zone.maxX - zone.minX, zone.maxZ - zone.minZ);
    this.geometries.push(markerGeometry);
    this.marker = new Mesh(
      markerGeometry,
      this.track(new MeshBasicMaterial({ color: 0x3aa8ff, transparent: true, opacity: 0.28, side: DoubleSide, depthWrite: false })),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.set((zone.minX + zone.maxX) / 2, HUB.floorY + 0.03, (zone.minZ + zone.maxZ) / 2);
    this.root.add(this.marker);

    this.sign = new CanvasSign(22, 5, [
      { text: 'Equipment Shop', size: 1, fill: '#ffd23d', stroke: '#5a3a00', strokeWidth: 0.2 },
    ]);
    this.sign.mesh.position.set(s.x, 12.5, s.z - 2);
    this.sign.mesh.rotation.y = Math.PI;
    this.root.add(this.sign.mesh);
  }

  private track<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private add(geometry: BufferGeometry, material: Material, x: number, y: number, z: number): Mesh {
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.sign.dispose();
    this.root.removeFromParent();
  }
}
