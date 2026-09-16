import {
  BIOMES,
  COURSE_END_Z,
  COURSE_TOP_Y,
  EQUIPMENT_STALL,
  HUB,
  PITS,
  STAIR_START_Z,
  STEPS,
  WIN_PADS,
  WorldCollision,
  formatNumber,
} from '@highjump/shared';
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, biomeLook } from '../config/worldVisuals.js';
import { BiomeDecor } from './BiomeDecor.js';
import { BiomeSign } from './BiomeSign.js';
import { BIOME_SIGN_RECTS } from './biomeSignLayout.js';
import { BootShop } from './BootShop.js';
import { HubDecor } from './HubDecor.js';
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
 * How far a wall sinks into the floor or step it meets.
 *
 * Walls used to END exactly on the edge they abut - two faces in one plane,
 * which the depth buffer cannot order, so the seam shimmered for the whole
 * length of every biome. Overlapping is the fix: an intersection has a real
 * winner at every pixel, and being buried it is never seen.
 */
const SEAM_OVERLAP = 0.08;

/** Height of the golden light column over each win pad. */
const GLOW_HEIGHT = 6;

/** Trophy images floating inside each win pad's glow. */
const TROPHIES_PER_PAD = 6;

/** A soft round glow, bright in the middle and clear at the edges. */
const radialGlowCanvas = (): HTMLCanvasElement => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.55, 'rgba(255,220,120,0.45)');
    gradient.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return canvas;
};

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
  private readonly biomeSigns: BiomeSign[] = [];
  /** Floating trophies over every win pad, and their bob phase and base height. */
  private readonly padTrophies: { sprite: Sprite; baseY: number; phase: number }[] = [];
  private readonly padGlow = new MeshBasicMaterial({
    color: 0xffc933,
    transparent: true,
    opacity: 0.2,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  private readonly padFloorGlow: MeshBasicMaterial;
  private readonly trophyMaterial: SpriteMaterial;
  private readonly textures2: Texture[] = [];
  private time = 0;
  private readonly decor = new BiomeDecor();
  private readonly hubDecor = new HubDecor();

  constructor() {
    const trophy = new TextureLoader().load('/ui/trophy.png');
    trophy.colorSpace = SRGBColorSpace;
    this.trophyMaterial = new SpriteMaterial({ map: trophy, transparent: true, depthWrite: false });
    const floor = new CanvasTexture(radialGlowCanvas());
    floor.colorSpace = SRGBColorSpace;
    this.padFloorGlow = new MeshBasicMaterial({
      map: floor,
      color: 0xffd23d,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.textures2.push(trophy, floor);
    this.training = new TrainingArea(this.textures);
    this.bootShop = new BootShop();
    this.stall = new EquipmentStall(this.textures);
    this.root.add(
      this.sky.root,
      this.scoreboard.root,
      this.training.root,
      this.bootShop.root,
      this.stall.root,
      this.decor.root,
      this.hubDecor.root,
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
    this.stall.update(delta);
    this.hubDecor.update(delta);

    this.time += delta;
    this.padGlow.opacity = 0.16 + Math.sin(this.time * 2.2) * 0.06;
    this.padFloorGlow.opacity = 0.75 + Math.sin(this.time * 2.2) * 0.2;
    for (const trophy of this.padTrophies) {
      trophy.sprite.position.y = trophy.baseY + Math.sin(this.time * 1.8 + trophy.phase) * 0.45;
      trophy.sprite.material.rotation = Math.sin(this.time * 1.3 + trophy.phase) * 0.18;
    }
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
      [0, HUB.minZ - 1.5 + SEAM_OVERLAP, width + 6, 3, h],
      [HUB.halfWidth + 1.5 - SEAM_OVERLAP, (HUB.minZ + HUB.maxZ) / 2, 3, depth + 3, h],
      [-(HUB.halfWidth + 1.5 - SEAM_OVERLAP), (HUB.minZ + HUB.maxZ) / 2, 3, depth + 3, h],
      // The front segments reach SEAM_OVERLAP further into the staircase mouth,
      // so their inner end is not level with the first step's side either.
      [(firstHalf + HUB.halfWidth + 3) / 2 - SEAM_OVERLAP / 2, HUB.maxZ + 1, HUB.halfWidth + 3 - firstHalf + SEAM_OVERLAP, 2, h],
      [-((firstHalf + HUB.halfWidth + 3) / 2 - SEAM_OVERLAP / 2), HUB.maxZ + 1, HUB.halfWidth + 3 - firstHalf + SEAM_OVERLAP, 2, h],
    ];
    for (const [x, z, w, d, height] of walls) {
      this.mesh(texturedBox(w, height, d, STUD), wallMat, x, height / 2, z);
      // The cap sits DOWN into its wall for the same reason.
      this.mesh(texturedBox(w + 1, 2, d + 1, STUD), capMat, x, height + 1 - SEAM_OVERLAP, z);
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
      // The floor of every gap: a studded pit a few units below the step before
      // it, so a missed jump lands somewhere rather than nowhere.
      for (const pit of PITS) {
        if (pit.biome !== biome.index) continue;
        const w = pit.maxX - pit.minX;
        const d = pit.maxZ - pit.minZ;
        const cz = (pit.minZ + pit.maxZ) / 2;
        const floor = texturedBox(w, 1, d, STUD);
        floor.translate(0, pit.floor - 0.5, cz);
        tops.push(floor);
        const under = texturedBox(w, 19, d, STUD * 2);
        under.translate(0, pit.floor - 1 - 9.5, cz);
        columns.push(under);
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
        wall.translate(side * (biome.width / 2 + 1.5 - SEAM_OVERLAP), (wallTop + wallBottom) / 2, (minZ + maxZ) / 2);
        walls.push(wall);
      }
      this.merged(walls, this.lambert({ color: look.wall, map: bricks }));

      // The name board: the same spot on every biome's first riser, in front
      // of its rocks, with scenery kept out of its sightline (biomeSignLayout).
      const rect = BIOME_SIGN_RECTS.find((entry) => entry.biome === biome.index);
      if (!rect) continue;
      const sign = new BiomeSign(biome.name);
      sign.mesh.position.set(rect.x, rect.y, rect.z);
      sign.mesh.rotation.y = Math.PI;
      sign.mesh.renderOrder = 3;
      this.biomeSigns.push(sign);
      this.root.add(sign.mesh);
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
      sign.mesh.position.set(cx, pad.maxY + 8, cz);
      sign.mesh.rotation.y = Math.PI;
      this.addSign(sign);

      // The golden glow: a soft column of light over the pad and a bright pool
      // on its floor, both additive so they read as light rather than as walls.
      this.mesh(new BoxGeometry(w - 0.4, GLOW_HEIGHT, d - 0.4), this.padGlow, cx, pad.maxY + GLOW_HEIGHT / 2, cz).castShadow = false;
      const pool = this.mesh(new PlaneGeometry(w + 4, d + 4), this.padFloorGlow, cx, pad.maxY + 0.06, cz);
      pool.rotation.x = -Math.PI / 2;
      pool.castShadow = false;
      pool.receiveShadow = false;

      // Trophies floating inside the glow. Sprites share one material and
      // always face the camera; `update` bobs them.
      for (let i = 0; i < TROPHIES_PER_PAD; i += 1) {
        const sprite = new Sprite(this.trophyMaterial);
        const angle = (i / TROPHIES_PER_PAD) * Math.PI * 2 + pad.biome;
        const baseY = pad.maxY + 1.4 + ((i * 0.37 + pad.biome * 0.13) % 1) * 3.2;
        sprite.position.set(cx + Math.cos(angle) * (w / 2 - 2.2), baseY, cz + Math.sin(angle) * (d / 2 - 2));
        sprite.scale.setScalar(1.5 + (i % 3) * 0.3);
        this.root.add(sprite);
        this.padTrophies.push({ sprite, baseY, phase: i * 1.7 + pad.biome });
      }
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
    for (const sign of this.biomeSigns) sign.dispose();
    this.padGlow.dispose();
    this.padFloorGlow.dispose();
    this.trophyMaterial.dispose();
    for (const texture of this.textures2) texture.dispose();
    this.decor.dispose();
    this.hubDecor.dispose();
    this.scoreboard.dispose();
    this.training.dispose();
    this.bootShop.dispose();
    this.stall.dispose();
    this.sky.dispose();
    this.textures.dispose();
    this.root.removeFromParent();
  }
}
