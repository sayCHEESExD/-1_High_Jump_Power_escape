import {
  BIOMES,
  COURSE_END_Z,
  COURSE_TOP_Y,
  EQUIPMENT_STALL,
  HUB,
  STAIR_START_Z,
  STEPS,
  WIN_PADS,
  WorldCollision,
  formatNumber,
} from '@highjump/shared';
import { Group, Mesh, MeshLambertMaterial, type BufferGeometry, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, biomeLook } from '../config/worldVisuals.js';
import { BootShop } from './BootShop.js';
import { CanvasSign } from './CanvasSign.js';
import { EquipmentStall } from './EquipmentStall.js';
import { Scoreboard } from './Scoreboard.js';
import { Sky } from './Sky.js';
import { TrainingArea } from './TrainingArea.js';
import { texturedBox } from './texturedBox.js';
import { WorldTextures } from './WorldTextures.js';

/** World units one stud covers. */
const STUD = 4;

/**
 * The visible world, built from exactly the same shared data the collision
 * model uses (`STEPS`, `WIN_PADS`, `HUB`), so what is drawn and what is solid
 * cannot drift apart.
 *
 * Geometry is merged per biome - one mesh for the studded step tops, one for
 * the cliff columns, one for the side walls - so the whole 50-step staircase
 * is about forty draw calls.
 */
export class CourseWorld {
  readonly root = new Group();
  readonly collision = new WorldCollision();
  readonly textures = new WorldTextures();
  readonly scoreboard = new Scoreboard();
  readonly training: TrainingArea;
  readonly bootShop: BootShop;
  readonly stall: EquipmentStall;
  readonly sky = new Sky(COURSE_END_Z, COURSE_TOP_Y);

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly signs: CanvasSign[] = [];

  constructor() {
    this.training = new TrainingArea(this.textures);
    this.bootShop = new BootShop();
    this.stall = new EquipmentStall(this.textures);
    this.root.add(
      this.sky.root,
      this.scoreboard.root,
      this.training.root,
      this.bootShop.root,
      this.stall.root,
    );
    this.buildHub();
    this.buildStaircase();
    this.buildWinPads();
  }

  addTo(parent: Group | { add: (object: Group) => unknown }): void {
    parent.add(this.root);
  }

  update(delta: number, cameraX: number, cameraY: number, cameraZ: number): void {
    this.sky.follow(cameraX, cameraY, cameraZ);
    this.training.update(delta);
    this.bootShop.update(delta);
  }

  private buildHub(): void {
    const floorMat = this.lambert({ map: this.textures.studs(PALETTE.hubFloor, PALETTE.hubFloorLine) });
    const width = HUB.halfWidth * 2;
    const depth = HUB.maxZ - HUB.minZ;
    this.mesh(texturedBox(width, 4, depth, STUD), floorMat, 0, HUB.floorY - 2, (HUB.minZ + HUB.maxZ) / 2);

    const wallMat = this.lambert({ color: PALETTE.hubWall, map: this.textures.bricks() });
    const capMat = this.lambert({ map: this.textures.studs(PALETTE.grass, PALETTE.grassLine) });
    const h = HUB.wallHeight;
    const firstHalf = (BIOMES[0]?.width ?? 64) / 2;

    const walls: [number, number, number, number, number][] = [
      // x, z, width, depth - back, left, right, and the two front segments.
      [0, HUB.minZ - 1.5, width + 6, 3, h],
      [HUB.halfWidth + 1.5, (HUB.minZ + HUB.maxZ) / 2, 3, depth + 3, h],
      [-HUB.halfWidth - 1.5, (HUB.minZ + HUB.maxZ) / 2, 3, depth + 3, h],
      [(firstHalf + HUB.halfWidth + 3) / 2, HUB.maxZ + 1, HUB.halfWidth + 3 - firstHalf, 2, h],
      [-(firstHalf + HUB.halfWidth + 3) / 2, HUB.maxZ + 1, HUB.halfWidth + 3 - firstHalf, 2, h],
    ];
    for (const [x, z, w, d, height] of walls) {
      this.mesh(texturedBox(w, height, d, STUD), wallMat, x, height / 2, z);
      this.mesh(texturedBox(w + 1, 2, d + 1, STUD), capMat, x, height + 1, z);
    }

    const title = new CanvasSign(40, 6, [
      { text: '+1 HIGH JUMP POWER', size: 1, fill: '#ffe14d', stroke: '#6b3a00', strokeWidth: 0.2 },
    ]);
    title.mesh.position.set(0, h + 6, HUB.maxZ + 2.2);
    title.mesh.rotation.y = Math.PI;
    this.addSign(title);
    void EQUIPMENT_STALL;
  }

  private buildStaircase(): void {
    const bricks = this.textures.bricks();
    for (const biome of BIOMES) {
      const look = biomeLook(biome.index);
      const steps = STEPS.filter((step) => step.biome === biome.index);
      const first = steps[0];
      const last = steps[steps.length - 1];
      if (!first || !last) continue;

      const tops: BufferGeometry[] = [];
      const columns: BufferGeometry[] = [];
      for (const step of steps) {
        const w = step.maxX - step.minX;
        const d = step.maxZ - step.minZ;
        const cz = (step.minZ + step.maxZ) / 2;
        const top = texturedBox(w, 1, d, STUD);
        top.translate(0, step.top - 0.5, cz);
        tops.push(top);
        const columnHeight = step.top - 1 - step.bottom;
        const column = texturedBox(w, columnHeight, d, STUD * 2);
        column.translate(0, step.bottom + columnHeight / 2, cz);
        columns.push(column);
      }
      this.merged(tops, this.lambert({ map: this.textures.studs(look.top, look.line) }));
      this.merged(columns, this.lambert({ color: look.cliff, map: bricks }));

      // The side walls that box each biome in, as in the reference.
      const minZ = first.minZ - biome.gap;
      const maxZ = last.maxZ;
      const wallBottom = first.bottom;
      const wallTop = last.top + 16;
      const walls: BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        const wall = texturedBox(3, wallTop - wallBottom, maxZ - minZ, STUD * 2);
        wall.translate(side * (biome.width / 2 + 1.5), (wallTop + wallBottom) / 2, (minZ + maxZ) / 2);
        walls.push(wall);
      }
      this.merged(walls, this.lambert({ color: look.wall, map: bricks }));

      const sign = new CanvasSign(24, 5, [
        { text: biome.name, size: 1, fill: '#ffffff', stroke: '#1b2433', strokeWidth: 0.2 },
      ]);
      sign.mesh.position.set(-(biome.width / 2 - 13), first.top + 7, first.minZ + 1);
      sign.mesh.rotation.y = Math.PI;
      this.addSign(sign);
    }

    const summit = STEPS[STEPS.length - 1];
    if (summit) {
      const sign = new CanvasSign(30, 7, [
        { text: 'SUMMIT', size: 1, fill: '#ffd23d', stroke: '#5a2b00', strokeWidth: 0.22 },
      ]);
      sign.mesh.position.set(0, summit.top + 10, summit.maxZ - 2);
      sign.mesh.rotation.y = Math.PI;
      this.addSign(sign);
    }
    void STAIR_START_Z;
  }

  private buildWinPads(): void {
    const gold = this.lambert({
      map: this.textures.studs(PALETTE.padGold, PALETTE.padGoldLine),
      emissive: 0x6b4a00,
    });
    const frame = this.lambert({ color: 0x1b2433 });
    for (const pad of WIN_PADS) {
      const w = pad.maxX - pad.minX;
      const d = pad.maxZ - pad.minZ;
      const cx = (pad.minX + pad.maxX) / 2;
      const cz = (pad.minZ + pad.maxZ) / 2;
      this.mesh(texturedBox(w + 1, 0.2, d + 1, STUD), frame, cx, pad.minY + 0.1, cz);
      this.mesh(texturedBox(w, pad.maxY - pad.minY, d, 2), gold, cx, (pad.minY + pad.maxY) / 2 + 0.02, cz);

      const sign = new CanvasSign(12, 5, [
        { text: 'Return', size: 0.7, fill: '#ffffff', stroke: '#1b2433', strokeWidth: 0.18 },
        { text: `+${formatNumber(pad.wins)} Win`, size: 1, fill: '#ffd23d', stroke: '#5a2b00', strokeWidth: 0.2 },
      ]);
      sign.mesh.position.set(cx, pad.maxY + 5, cz);
      sign.mesh.rotation.y = Math.PI;
      this.addSign(sign);
    }
  }

  private lambert(params: ConstructorParameters<typeof MeshLambertMaterial>[0]): MeshLambertMaterial {
    const material = new MeshLambertMaterial(params);
    this.materials.push(material);
    return material;
  }

  private mesh(geometry: BufferGeometry, material: Material, x: number, y: number, z: number): Mesh {
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  private merged(parts: BufferGeometry[], material: Material): void {
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) return;
    this.mesh(geometry, material, 0, 0, 0);
  }

  private addSign(sign: CanvasSign): void {
    this.signs.push(sign);
    this.root.add(sign.mesh);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const sign of this.signs) sign.dispose();
    this.scoreboard.dispose();
    this.training.dispose();
    this.bootShop.dispose();
    this.stall.dispose();
    this.sky.dispose();
    this.textures.dispose();
    this.root.removeFromParent();
  }
}
