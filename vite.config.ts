import { defineConfig, type Plugin } from 'vite';
import { GAME_TITLE } from './src/data/constants';

function title(): Plugin {
  return { name: 'game-title', transformIndexHtml: (html) => html.replace(/%GAME_TITLE%/g, GAME_TITLE) };
}

export default defineConfig({
  base: './',
  plugins: [title()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    manifest: true,
  },
});
