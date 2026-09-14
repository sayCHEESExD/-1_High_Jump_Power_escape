import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));
const repoAssets = fileURLToPath(new URL('../assets', import.meta.url));

/**
 * Files in `assets/` that are never loaded at runtime. `base_rig.fbx` is
 * byte-identical to `player.fbx`; shipping both would double the largest model.
 */
const UNSHIPPED_ASSETS = ['player/base_rig.fbx'];

const pruneUnusedAssets = (): Plugin => ({
  name: 'highjump:prune-unused-assets',
  apply: 'build',
  async closeBundle() {
    for (const relativePath of UNSHIPPED_ASSETS) {
      await rm(join(clientRoot, 'dist', relativePath), { force: true });
    }
  },
});

export default defineConfig({
  plugins: [pruneUnusedAssets()],
  root: clientRoot,
  /** The repo-level `assets/` is the public root: `/player/*`, `/ui/*`, `/audio/*`. */
  publicDir: repoAssets,
  server: {
    // Not 5173-5175: the previous games in this series use those.
    port: 5176,
    strictPort: true,
    host: true,
  },
  preview: {
    port: 4176,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          net: ['colyseus.js'],
        },
      },
    },
  },
});
