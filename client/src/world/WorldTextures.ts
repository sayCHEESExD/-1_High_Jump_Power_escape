import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/**
 * Every world texture, drawn on a canvas at runtime and cached. Not one image
 * file is used for the world - the toy-brick look costs a few kilobytes of code.
 */
export class WorldTextures {
  private readonly cache = new Map<string, Texture>();

  /** A studded brick plate: one stud per tile with a highlight and a shadow. */
  studs(colour: string, line: string): Texture {
    return this.cached(`studs:${colour}:${line}`, () => {
      const size = 64;
      const ctx = context(size);
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = line;
      ctx.fillRect(0, 0, size, 2);
      ctx.fillRect(0, 0, 2, size);
      // Stud shadow, body and highlight.
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.arc(size / 2 + 2, size / 2 + 3, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = line;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(size / 2 - 1, size / 2 - 1, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(size / 2 - 1, size / 2 - 1, 11, Math.PI * 1.05, Math.PI * 1.6);
      ctx.stroke();
      return ctx.canvas;
    });
  }

  /** Neutral brick courses, tinted by the material colour: cliffs and walls. */
  bricks(): Texture {
    return this.cached('bricks', () => {
      const size = 64;
      const ctx = context(size);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#d9d9d9';
      ctx.fillRect(0, 30, size, 3);
      ctx.fillRect(0, 62, size, 2);
      ctx.fillRect(30, 0, 3, 31);
      ctx.fillRect(0, 33, 2, 30);
      ctx.fillRect(62, 33, 2, 30);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(4, 4, 22, 3);
      ctx.fillRect(36, 37, 22, 3);
      return ctx.canvas;
    });
  }

  /** Treadmill belt: dark rubber with chevrons pointing along V (the belt's length). */
  belt(base: string, mark: string): Texture {
    return this.cached(`belt:${base}:${mark}`, () => {
      const size = 64;
      const ctx = context(size);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = mark;
      for (let i = 0; i < 2; i += 1) {
        const at = i * 32;
        ctx.beginPath();
        ctx.moveTo(4, at + 22);
        ctx.lineTo(size / 2, at + 4);
        ctx.lineTo(size - 4, at + 22);
        ctx.lineTo(size - 4, at + 28);
        ctx.lineTo(size / 2, at + 10);
        ctx.lineTo(4, at + 28);
        ctx.closePath();
        ctx.fill();
      }
      return ctx.canvas;
    });
  }

  dispose(): void {
    for (const texture of this.cache.values()) texture.dispose();
    this.cache.clear();
  }

  private cached(key: string, draw: () => HTMLCanvasElement): Texture {
    const existing = this.cache.get(key);
    if (existing) return existing;
    const texture = new CanvasTexture(draw());
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = 4;
    this.cache.set(key, texture);
    return texture;
  }
}

const context = (size: number): CanvasRenderingContext2D => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
};
