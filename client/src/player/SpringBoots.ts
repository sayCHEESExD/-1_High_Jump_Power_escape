import { bootBySlot } from '@highjump/shared';
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
  type Bone,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * How far the springs lift the character's body off the ground, in world
 * units. `PlayerCharacter` raises the model by exactly this while boots are
 * worn, and each spring spans exactly this gap, so the boot's base pad lands on
 * the floor while the shoe stays on the foot.
 */
export const SPRING_LIFT = 0.6;

/**
 * Where the shoe's SOLE sits relative to the lower leg bone, in world units at
 * bind pose (from the backflip game's boot model: the bone is ~0.6 above the
 * sole, and the shoe pokes slightly forward).
 */
const SOLE_OFFSET = new Vector3(0, -0.62, 0.12);

const SHOE = { width: 1.0, height: 0.5, depth: 1.3 } as const;

/** One coil turn every this many units of spring. */
const COIL_PITCH = 0.14;

/**
 * Spring boots on the player's feet: a shoe on each foot, a coil spring under
 * it, and a base pad under the spring that touches the ground.
 *
 * Parented to the two lower leg bones, so they follow walking, jumping and
 * backflips with no animation code of their own. The leg bones' local axes do
 * not match the character's, and the FBX bakes a scale onto them, so the holder
 * is placed from the bind pose: the world offset is rotated into bone space and
 * divided by the bone's world scale, and the holder is counter-rotated so the
 * boot stays square to the character.
 *
 * Purely cosmetic. Which boot is worn is replicated server state; the energy
 * bonus is untouched.
 */
export class SpringBoots {
  private readonly holders: Group[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly shoeMaterial = new MeshLambertMaterial({ color: 0x3aa8ff });
  private readonly padMaterial = new MeshLambertMaterial({ color: 0x3aa8ff });
  private readonly springMaterial = new MeshLambertMaterial({ color: 0x9aa3ad, emissive: 0x20242c });
  private readonly trimMaterial = new MeshLambertMaterial({ color: 0xf2f5f7 });
  private slot = -1;

  constructor(legBones: readonly (Bone | null)[]) {
    const shoe = new BoxGeometry(SHOE.width, SHOE.height, SHOE.depth);
    shoe.translate(0, SHOE.height / 2, 0.05);
    const toe = new BoxGeometry(SHOE.width * 0.9, SHOE.height * 0.6, 0.3);
    toe.translate(0, SHOE.height * 0.3, SHOE.depth / 2 + 0.15);
    const shoeGeometry = mergeGeometries([shoe, toe], false) ?? shoe;
    const sole = new BoxGeometry(SHOE.width * 1.04, 0.12, SHOE.depth * 1.08);
    sole.translate(0, 0.06, 0.08);

    // The coil: stacked tori around a thin post, spanning the lift gap.
    const springHeight = SPRING_LIFT - 0.12;
    const parts: BufferGeometry[] = [];
    const turns = Math.max(2, Math.round(springHeight / COIL_PITCH));
    for (let i = 0; i < turns; i += 1) {
      const ring = new TorusGeometry(0.26, 0.05, 6, 12);
      ring.rotateX(Math.PI / 2);
      ring.translate(0, -0.08 - (i + 0.5) * (springHeight / turns), 0);
      parts.push(ring);
    }
    const post = new CylinderGeometry(0.07, 0.07, springHeight, 6);
    post.translate(0, -springHeight / 2 - 0.02, 0);
    parts.push(post);
    const springGeometry = mergeGeometries(parts, false) ?? post;

    const pad = new BoxGeometry(SHOE.width * 0.9, 0.12, SHOE.depth * 0.8);
    pad.translate(0, -SPRING_LIFT + 0.06, 0.05);

    this.geometries.push(shoeGeometry, sole, springGeometry, pad);
    for (const part of [shoe, toe, ...parts]) if (part !== shoeGeometry && part !== springGeometry) part.dispose();

    const boneWorld = new Quaternion();
    const boneScale = new Vector3();
    for (const bone of legBones) {
      if (!bone) continue;
      bone.updateWorldMatrix(true, false);
      bone.getWorldQuaternion(boneWorld);
      bone.getWorldScale(boneScale);
      const scale = boneScale.x || 1;
      const inverse = boneWorld.clone().invert();

      const holder = new Group();
      holder.position.copy(SOLE_OFFSET).applyQuaternion(inverse).divideScalar(scale);
      holder.quaternion.copy(inverse);
      holder.scale.setScalar(1 / scale);

      for (const [geometry, material] of [
        [shoeGeometry, this.shoeMaterial],
        [sole, this.trimMaterial],
        [springGeometry, this.springMaterial],
        [pad, this.padMaterial],
      ] as const) {
        const mesh = new Mesh(geometry, material);
        mesh.castShadow = true;
        // Skinned-model bounds are unreliable; never cull a boot off a foot.
        mesh.frustumCulled = false;
        holder.add(mesh);
      }
      holder.visible = false;
      bone.add(holder);
      this.holders.push(holder);
    }
  }

  /** True while a boot is being shown. */
  get worn(): boolean {
    return this.slot > 0;
  }

  /** Show the given boot tier, or 0 for barefoot. */
  setSlot(slot: number): void {
    const tier = slot > 0 ? bootBySlot(slot) : undefined;
    const next = tier?.slot ?? 0;
    if (next === this.slot) return;
    this.slot = next;
    for (const holder of this.holders) holder.visible = next > 0;
    if (tier) {
      this.shoeMaterial.color.setHex(tier.color);
      this.padMaterial.color.setHex(tier.color).multiplyScalar(0.7);
    }
  }

  dispose(): void {
    for (const holder of this.holders) holder.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    this.shoeMaterial.dispose();
    this.padMaterial.dispose();
    this.springMaterial.dispose();
    this.trimMaterial.dispose();
  }
}
