import {
  CanvasTexture,
  FrontSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { BIOME_SIGN } from './biomeSignLayout.js';

const FONT = '"Arial Black", "Segoe UI", system-ui, sans-serif';
const INK = '#12181f';

/** Canvas layout, in pixels. */
const CANVAS_W = 540;
const CANVAS_H = 420;
/** The box the biome picture is fitted into, above the name. */
const PICTURE = { x: 270, y: 158, w: 300, h: 250 } as const;

/**
 * Each biome's picture is a supplied PNG in `assets/ui/`, named exactly after
 * the biome (`Snow Peak.png`), so the BIOMES table is the only mapping.
 */
export const biomeImageUrl = (name: string): string => `/ui/${encodeURIComponent(name)}.png`;

/**
 * A biome's name board: just the biome's picture directly ABOVE its name - no
 * panel or frame. A drop shadow on the picture and a dark outline on the name
 * keep both readable against any cliff. Drawn once without the picture, then
 * again when the image has loaded.
 */
export class BiomeSign {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly geometry: PlaneGeometry;

  constructor(name: string) {
    const { width, height } = BIOME_SIGN;
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.draw(name, null);

    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = LinearFilter;
    this.texture.anisotropy = 8;
    this.geometry = new PlaneGeometry(width, height);
    this.material = new MeshBasicMaterial({ map: this.texture, transparent: true, side: FrontSide, depthWrite: false });
    this.mesh = new Mesh(this.geometry, this.material);

    const image = new Image();
    image.onload = () => {
      this.draw(name, image);
      this.texture.needsUpdate = true;
    };
    image.src = biomeImageUrl(name);
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.geometry.dispose();
    this.mesh.removeFromParent();
  }

  private draw(name: string, picture: HTMLImageElement | null): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // No panel or frame: just the picture and the name, floating on the riser.

    // Picture, fitted inside its box keeping its aspect ratio.
    if (picture && picture.width > 0 && picture.height > 0) {
      const scale = Math.min(PICTURE.w / picture.width, PICTURE.h / picture.height);
      const w = picture.width * scale;
      const h = picture.height * scale;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
      ctx.drawImage(picture, PICTURE.x - w / 2, PICTURE.y - h / 2, w, h);
      ctx.restore();
    }

    // Name, shrunk to fit.
    let size = 64;
    ctx.font = `900 ${size}px ${FONT}`;
    while (ctx.measureText(name).width > 470 && size > 30) {
      size -= 2;
      ctx.font = `900 ${size}px ${FONT}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.22;
    ctx.strokeStyle = INK;
    ctx.strokeText(name, 270, 352);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, 270, 352);
  }
}
