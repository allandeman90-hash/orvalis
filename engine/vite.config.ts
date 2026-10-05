import { defineConfig } from 'vitest/config';
import { legacyPagePlugin } from './scripts/legacyPagePlugin.mjs';

export default defineConfig({
  // Relative URLs so the built site works from any folder or sub-path.
  base: './',
  plugins: [legacyPagePlugin()],
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
