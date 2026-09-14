import { NO_AURA, PLAYER_HEIGHT, auraBySlot, type AuraStyle } from '@highjump/shared';
import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  OctahedronGeometry,
} from 'three';

const MOTE_COUNT = 12;
const ORBIT_RADIUS = 1.15;

/**
 * The glow worn around a player. Two draw calls whatever the tier: a
 * translucent back-face shell and one InstancedMesh of motes, whose motion and
 * colour give each aura its identity. Cosmetic only - the server decides what
 * is worn and what it multiplies.
 */
export class AuraEffect {
  readonly root = new Group();

  private readonly shellGeometry = new IcosahedronGeometry(1, 1);
  private readonly moteGeometry = new OctahedronGeometry(0.13, 0);
  private readonly shellMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: BackSide,
    blending: AdditiveBlending,
    fog: false,
  });
  private readonly moteMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  });
  private readonly shell: Mesh;
  private readonly motes: InstancedMesh;
  private readonly dummy = new Object3D();

  private slot = NO_AURA;
  private style: AuraStyle = 'nature';
  private readonly color = new Color();
  private readonly accent = new Color();
  private readonly scratch = new Color();
  private time = 0;

  constructor() {
    this.shell = new Mesh(this.shellGeometry, this.shellMaterial);
    this.shell.position.y = PLAYER_HEIGHT * 0.5;
    this.motes = new InstancedMesh(this.moteGeometry, this.moteMaterial, MOTE_COUNT);
    this.motes.frustumCulled = false;
    this.root.add(this.shell, this.motes);
    this.root.visible = false;
  }

  setSlot(slot: number): void {
    if (slot === this.slot) return;
    this.slot = slot;
    const tier = auraBySlot(slot);
    if (!tier) {
      this.root.visible = false;
      return;
    }
    this.style = tier.style;
    this.color.setHex(tier.color);
    this.accent.setHex(tier.accent);
    this.shellMaterial.color.copy(this.color);
    // Dark auras cannot glow additively; they draw normally instead.
    const dark = this.style === 'blackflash' || this.style === 'void';
    this.shellMaterial.blending = dark ? NormalBlending : AdditiveBlending;
    this.shellMaterial.opacity = dark ? 0.4 : 0.22;
    this.root.visible = true;
  }

  update(delta: number): void {
    if (!this.root.visible) return;
    this.time += delta;
    const pulse = 1 + Math.sin(this.time * (this.style === 'lightning' ? 14 : 2.4)) * 0.06;
    this.shell.scale.set(1.35 * pulse, PLAYER_HEIGHT * 0.55 * pulse, 1.35 * pulse);

    for (let i = 0; i < MOTE_COUNT; i += 1) {
      this.placeMote(i);
      this.dummy.updateMatrix();
      this.motes.setMatrixAt(i, this.dummy.matrix);
      this.motes.setColorAt(i, this.moteColor(i));
    }
    this.motes.instanceMatrix.needsUpdate = true;
    if (this.motes.instanceColor) this.motes.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.shellGeometry.dispose();
    this.moteGeometry.dispose();
    this.shellMaterial.dispose();
    this.moteMaterial.dispose();
  }

  private placeMote(index: number): void {
    const phase = (index / MOTE_COUNT) * Math.PI * 2;
    const t = this.time;
    const cycle = (rate: number): number => (t * rate + index / MOTE_COUNT) % 1;
    let radius = ORBIT_RADIUS;
    let height = PLAYER_HEIGHT * 0.5;
    let scale = 1;
    let spin = 1.1;

    switch (this.style) {
      case 'flame':
        height = cycle(1.6) * PLAYER_HEIGHT;
        radius = 0.55 + (1 - height / PLAYER_HEIGHT) * 0.35;
        scale = 1 - height / PLAYER_HEIGHT / 1.4;
        break;
      case 'nature':
      case 'sakura':
        // Leaves and petals drifting DOWN around the player.
        height = (1 - cycle(0.5)) * PLAYER_HEIGHT * 1.2;
        radius = 0.9 + Math.sin(t * 2 + phase) * 0.3;
        spin = 0.6;
        break;
      case 'crystal':
        radius = 1.05;
        height = PLAYER_HEIGHT * (0.2 + ((index * 0.37) % 1) * 0.7);
        scale = 0.8 + Math.abs(Math.sin(t * 3 + phase)) * 0.6;
        spin = 0.5;
        break;
      case 'lightning':
      case 'blackflash':
        radius = 0.9 + (Math.floor(t * 12 + index) % 3) * 0.22;
        height = PLAYER_HEIGHT * (0.15 + ((Math.floor(t * 9) + index) % 5) / 6);
        scale = 1.15;
        spin = 0.2;
        break;
      case 'ghost':
        radius = 1.2 + Math.sin(t * 1.3 + phase) * 0.35;
        height = PLAYER_HEIGHT * 0.5 + Math.sin(t * 0.9 + phase * 2) * 1.1;
        scale = 1.3;
        spin = 0.4;
        break;
      case 'time':
        // A clock face: motes hold the hour positions around the waist.
        radius = 1.25;
        height = PLAYER_HEIGHT * 0.55;
        scale = index % 3 === 0 ? 1.5 : 0.8;
        spin = 0.25;
        break;
      case 'toxic':
        height = cycle(0.9) * PLAYER_HEIGHT;
        radius = 1.05 + Math.sin(t * 2 + phase) * 0.2;
        scale = 0.8 + Math.sin(t * 3 + phase) * 0.3;
        break;
      case 'void':
        radius = 0.4 + cycle(0.5) * 1.1;
        height = PLAYER_HEIGHT * 0.5 + Math.sin(t + phase) * 0.7;
        scale = 1.3 - radius / 2;
        spin = 1.8;
        break;
      case 'magic':
        radius = 0.8 + Math.sin(t * 5 + phase) * 0.45;
        height = PLAYER_HEIGHT * (0.2 + ((index * 0.37 + t * 0.3) % 1) * 0.8);
        scale = 0.6 + Math.abs(Math.sin(t * 7 + phase)) * 0.9;
        break;
    }

    const angle = phase + t * spin;
    this.dummy.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    this.dummy.rotation.set(t + phase, t * 0.7 + phase, 0);
    this.dummy.scale.setScalar(Math.max(0.05, scale));
  }

  private moteColor(index: number): Color {
    if (this.style === 'magic') {
      this.scratch.setHSL((this.time * 0.6 + index / MOTE_COUNT) % 1, 1, 0.6);
    } else if (this.style === 'lightning' || this.style === 'blackflash') {
      this.scratch.copy(Math.floor(this.time * 12 + index) % 2 === 0 ? this.accent : this.color);
    } else if (this.style === 'flame') {
      this.scratch.copy(this.color).lerp(this.accent, (index / MOTE_COUNT + this.time) % 1);
    } else {
      this.scratch.copy(index % 3 === 0 ? this.accent : this.color);
    }
    return this.scratch;
  }
}
