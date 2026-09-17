import { PLAYER_HEIGHT } from '@highjump/shared';
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Bone,
  type Object3D,
  type Texture,
} from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { PlayerCharacter } from '../player/PlayerCharacter.js';
import { logger } from '../util/logger.js';
import { bloxityBodyFactory } from './BloxityBodyFactory.js';
import { BLOXITY_MODEL_HEIGHT, DEFAULT_SKIN_ID, resolveItemUrls, resolveSkinUrl } from './bloxityAssets.js';
import { DEFAULT_PROPORTIONS, isEquippedId, type LegionEquipped, type LegionProportions } from './legionTypes.js';

const SCOPE = 'bloxity/avatar';

/** World size of one unit of a Bloxity item, from the GLB's own scale. */
const ITEM_WORLD_SCALE = PLAYER_HEIGHT / BLOXITY_MODEL_HEIGHT;
/** The reference page's hat lift on the head bone, in GLB units. */
const HAT_LIFT = 0.8;
/** How far behind the chest a back item sits on the bundled body, in world units. */
const FBX_BACK_OFFSET = -0.18;

const SCRATCH = new Vector3();

/** The `bodyKey` of the bundled character. No Bloxity loadout can spell it. */
const BUNDLED_BODY = 'bundled';

/**
 * A Bloxity avatar worn by a character - the local player's, or a remote's.
 *
 *  - the BODY: `player.glb` with its parts swapped in. Worn whenever Bloxity
 *    HAS an appearance for this player, a wholly default avatar included,
 *    because Bloxity's avatar is the source of truth for how they look;
 *  - the SKIN, as the body material's map (Bloxity's default skin when the
 *    account equips none - a Bloxity skin is UV-mapped for that body);
 *  - the HAT and BACK item, parented to real bones so they follow the jump;
 *  - the PROPORTIONS, as scales and offsets on bones. Never rotations:
 *    `PlayerRig` rebuilds every bone quaternion each frame.
 *
 * The character bundled with this game is the FALLBACK, and only that: it is
 * worn before Bloxity answers, after `clear()`, and if the body fails to load.
 */
export class BloxityAvatar {
  private readonly objLoader = new OBJLoader();
  private readonly textureLoader = new TextureLoader();

  private equipped: LegionEquipped = {};
  private proportions: LegionProportions = DEFAULT_PROPORTIONS;

  /** Which body is worn; `BUNDLED_BODY` while the game's own character is. */
  private bodyKey = BUNDLED_BODY;
  private bodyToken = 0;
  private bones = new Map<string, Bone>();
  private material: MeshStandardMaterial | null = null;
  private defaultMap: Texture | null = null;
  private wearingBloxityBody = false;
  /** Whether `material` belongs to a Bloxity body (not ours to dispose) or is our clone. */
  private wearingBloxityBodyMaterial = false;

  private readonly attachments = new Map<'hat' | 'back', Object3D>();
  private currentSkin: string | null = null;
  private currentHat: string | null = null;
  private currentBack: string | null = null;
  private readonly textures: Texture[] = [];

  private disposed = false;

  constructor(private readonly character: PlayerCharacter) {
    this.bind(character.modelRoot, false);
  }

  /**
   * Wear this Bloxity look. Safe to call on every avatar event; unchanged slots
   * do no work.
   *
   * ALWAYS Bloxity's body, even when the account has nothing equipped: an empty
   * loadout IS the Bloxity default avatar - their body wearing their default
   * skin - not an invitation to show the character bundled with this game.
   * Wearing ours there was the bug, and it made every default avatar look like
   * our own character. The bundled body is now only ever reached through
   * `clear()` or when Bloxity's body cannot be loaded at all.
   */
  apply(equipped: LegionEquipped, proportions: LegionProportions): void {
    if (this.disposed) return;
    this.equipped = equipped;
    this.proportions = proportions;

    const key = bodyKeyOf(equipped);
    if (key !== this.bodyKey) {
      this.bodyKey = key;
      void this.rebuildBody(true);
    }
    this.wearLayers();
  }

  /**
   * Go back to the bundled character: this player has no Bloxity appearance to
   * show, because they signed out or were never on Bloxity at all.
   */
  clear(): void {
    if (this.disposed || this.bodyKey === BUNDLED_BODY) return;
    this.bodyKey = BUNDLED_BODY;
    this.equipped = {};
    this.proportions = DEFAULT_PROPORTIONS;
    void this.rebuildBody(false);
  }

  dispose(): void {
    this.disposed = true;
    this.bodyToken += 1;
    for (const node of this.attachments.values()) node.removeFromParent();
    this.attachments.clear();
    for (const texture of this.textures) texture.dispose();
    if (!this.wearingBloxityBodyMaterial) this.material?.dispose();
  }

  private async rebuildBody(wantsBody: boolean): Promise<void> {
    const token = (this.bodyToken += 1);
    const body = wantsBody ? await bloxityBodyFactory.build(this.equipped) : null;
    if (this.disposed || token !== this.bodyToken) return;

    const model = this.character.setModel(body);
    this.bind(model, body !== null);
    this.wearLayers();
    logger.info(SCOPE, body ? 'wearing the Bloxity body' : 'wearing the bundled body');
  }

  /** Re-collect everything tied to a particular model, and forget what was worn on the old one. */
  private bind(model: Object3D, bloxityBody: boolean): void {
    for (const node of this.attachments.values()) node.removeFromParent();
    this.attachments.clear();
    this.currentSkin = null;
    this.currentHat = null;
    this.currentBack = null;

    this.wearingBloxityBody = bloxityBody;
    this.bones = collectBones(model);

    // Only a material this class cloned is its to dispose. The bundled body
    // shares ONE material with every remote player, so it is cloned before
    // anything writes to it.
    if (this.material && !this.wearingBloxityBodyMaterial) this.material.dispose();
    let material: MeshStandardMaterial | null = null;
    model.traverse((child) => {
      if (!(child instanceof Mesh) || !(child.material instanceof MeshStandardMaterial)) return;
      material ??= bloxityBody ? child.material : child.material.clone();
      child.material = material;
    });
    this.material = material;
    this.wearingBloxityBodyMaterial = bloxityBody;
    this.defaultMap = (material as MeshStandardMaterial | null)?.map ?? null;
  }

  private wearLayers(): void {
    void this.applySkin();
    void this.applyItem('hat', this.equipped.hatId ?? null);
    void this.applyItem('back', this.equipped.backId ?? null);
    this.applyProportions(this.proportions);
  }

  // ------------------------------------------------------------------ skin

  private async applySkin(): Promise<void> {
    // Only the Bloxity body wears a Bloxity skin, and with none equipped it
    // wears Bloxity's default rather than rendering white.
    const wanted = this.wearingBloxityBody ? (isEquippedId(this.equipped.skinId) ? this.equipped.skinId : DEFAULT_SKIN_ID) : null;
    if (wanted === this.currentSkin) return;
    this.currentSkin = wanted;

    const material = this.material;
    if (!material) return;
    if (!wanted) {
      material.map = this.defaultMap;
      material.needsUpdate = true;
      return;
    }

    const url = await resolveSkinUrl(wanted);
    if (this.disposed || this.currentSkin !== wanted || this.material !== material) return;

    this.textureLoader.load(
      url,
      (texture) => {
        if (this.disposed || this.currentSkin !== wanted || this.material !== material) {
          texture.dispose();
          return;
        }
        // A skin wraps the glTF body: glTF UV convention.
        dressTexture(texture, false);
        this.textures.push(texture);
        material.map = texture;
        material.needsUpdate = true;
      },
      undefined,
      () => logger.warn(SCOPE, `skin ${wanted} failed to load`),
    );
  }

  // ----------------------------------------------------------------- items

  private async applyItem(slot: 'hat' | 'back', id: string | null): Promise<void> {
    const wanted = isEquippedId(id) ? id : null;
    const current = slot === 'hat' ? this.currentHat : this.currentBack;
    if (wanted === current) return;
    if (slot === 'hat') this.currentHat = wanted;
    else this.currentBack = wanted;

    this.attachments.get(slot)?.removeFromParent();
    this.attachments.delete(slot);
    if (!wanted) return;

    const anchor = this.bones.get(slot === 'hat' ? 'Neck1' : 'Spine2');
    if (!anchor) {
      logger.warn(SCOPE, `no bone to hang a ${slot} on`);
      return;
    }

    try {
      const urls = await resolveItemUrls(slot, wanted);
      const [object, texture] = await Promise.all([
        this.objLoader.loadAsync(urls.mesh),
        this.textureLoader.loadAsync(urls.texture),
      ]);
      const still = slot === 'hat' ? this.currentHat : this.currentBack;
      // `anchor.parent` is null once a body swap has taken this skeleton away.
      if (this.disposed || still !== wanted || !anchor.parent || !this.bones.has(anchor.name)) {
        texture.dispose();
        return;
      }
      // Hats and back items are OBJ meshes: ordinary UV convention.
      dressTexture(texture, true);
      this.textures.push(texture);
      const material = new MeshStandardMaterial({ map: texture, roughness: 0.85 });
      object.traverse((child) => {
        if (child instanceof Mesh) {
          child.material = material;
          child.castShadow = true;
        }
      });

      // Sized in WORLD terms, not bone terms: the two bodies do not share a
      // bone space, so dividing by the anchor's world scale gives both the size
      // the item has on Bloxity's own renderer, in this game's units.
      anchor.updateWorldMatrix(true, false);
      const boneScale = anchor.getWorldScale(SCRATCH).y || 1;
      object.scale.setScalar(ITEM_WORLD_SCALE / boneScale);
      if (slot === 'hat') {
        object.position.set(0, (HAT_LIFT * ITEM_WORLD_SCALE) / boneScale, 0);
      } else {
        object.position.set(0, 0, this.wearingBloxityBody ? 0 : FBX_BACK_OFFSET / boneScale);
      }

      anchor.add(object);
      this.attachments.set(slot, object);
    } catch {
      logger.warn(SCOPE, `${slot} ${wanted} failed to load`);
    }
  }

  // ----------------------------------------------------------- proportions

  /**
   * Proportions, after the reference page's viewer: height stretches the body
   * vertically, arm length scales the arm bones, head scale scales the neck bone
   * while undoing the height stretch on it, neck height lifts the head. All
   * relative to each bone's REST values, so the two bodies' units never matter.
   */
  private applyProportions(p: LegionProportions): void {
    const num = (value: number, fallback = 1): number => (Number.isFinite(value) ? value : fallback);
    const height = Math.max(0.05, num(p.height));

    const model = this.character.modelRoot;
    const base = (model.userData['baseScale'] as number | undefined) ?? model.scale.x;
    model.userData['baseScale'] = base;
    model.scale.set(base, base * height, base);

    this.scaleBone('Spine1', (rest, bone) => bone.scale.set(rest.x * num(p.torsoScaleX), rest.y, rest.z));
    this.scaleBone('Spine2', (rest, bone) => bone.scale.set(rest.x * num(p.shoulderWidth), rest.y, rest.z));
    for (const name of ['ArmL1', 'ArmR1']) {
      this.scaleBone(name, (rest, bone) => bone.scale.set(rest.x, rest.y * num(p.armLength), rest.z));
    }
    const head = num(p.headScale);
    this.scaleBone('Neck1', (rest, bone) => bone.scale.set(rest.x * head, (rest.y * head) / height, rest.z * head));
    this.moveBone('Neck1', (rest, bone) => {
      bone.position.y = rest.y * (1 + (num(p.neckHeight) - 1) * 0.8);
    });
    // Leg spread, proportional to how far each hip already sits off the centre.
    for (const name of ['LegL1', 'LegR1']) {
      this.moveBone(name, (rest, bone) => {
        bone.position.x = rest.x * (1 + (num(p.legOffsetX) - 1) * 0.5);
      });
    }
  }

  private scaleBone(name: string, write: (rest: Vector3, bone: Bone) => void): void {
    const bone = this.bones.get(name);
    if (!bone) return;
    bone.userData['restScale'] ??= bone.scale.clone();
    write(bone.userData['restScale'] as Vector3, bone);
  }

  private moveBone(name: string, write: (rest: Vector3, bone: Bone) => void): void {
    const bone = this.bones.get(name);
    if (!bone) return;
    bone.userData['restPosition'] ??= bone.position.clone();
    write(bone.userData['restPosition'] as Vector3, bone);
  }
}

/** Body parts only: a hat or skin change must not refetch an identical body. */
const bodyKeyOf = (e: LegionEquipped): string =>
  [e.headId, e.torsoId, e.armLId, e.armRId, e.legLId, e.legRId].map((id) => (isEquippedId(id) ? id : '-')).join('|');

/** Up to this size a Bloxity texture is pixel art and must not be smoothed. */
const PIXEL_ART_MAX = 128;

/**
 * Settle a Bloxity texture: colour space, orientation and FILTERING.
 *
 * Bloxity's catalogue mixes 16px pixel art with 4096px painted detail, and the
 * two want opposite filtering.
 *
 * `flipY` is NOT one setting for all of them, which is what made hats and back
 * items render as smears. A SKIN dresses the glTF body, whose UVs are authored
 * the glTF way (origin at the top, `flipY` false). A hat or a back item is an
 * OBJ, whose UVs are authored the ordinary way (origin at the bottom, `flipY`
 * true, three's default). Verified item by item against Bloxity's own viewer.
 */
const dressTexture = (texture: Texture, flipY: boolean): void => {
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = flipY;

  // `Texture.image` is loosely typed; every source here is an HTMLImageElement.
  const image = texture.image as { width?: number; height?: number } | undefined;
  const size = Math.max(image?.width ?? 0, image?.height ?? 0);
  if (size <= PIXEL_ART_MAX) {
    // Genuine pixel art: smoothing turns a 16px face into a smudge.
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
  } else {
    // NOT pixel art. Nearest with no mipmaps samples one texel per pixel, so a
    // 1024px hat drawn over a head-sized patch of screen skips most of the
    // image and lands on a different texel every frame - the speckled, torn
    // look these items had. Mipmaps are what a texture this size is for.
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
  }
  texture.needsUpdate = true;
};

/** Bones by name, first one wins - the same rule `PlayerRig` uses. */
const collectBones = (model: Object3D): Map<string, Bone> => {
  const found = new Map<string, Bone>();
  model.traverse((child) => {
    const bone = child as Bone;
    if (bone.isBone && !found.has(bone.name)) found.set(bone.name, bone);
  });
  return found;
};
