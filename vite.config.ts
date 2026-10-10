import { defineConfig, loadEnv, type Plugin } from 'vite';
import { GAME_TITLE } from './src/data/constants';

/** The one runtime script allowed per portal (CLAUDE.md): chosen by VITE_PLATFORM, default CrazyGames. */
const SDK_SCRIPT: Record<string, string> = {
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
  playgama: 'https://bridge.playgama.com/v2/stable/playgama-bridge.js',
};

/** Playgama Bridge reads this next to index.html: no Bridge splash (no splash at all, §2), our own ad UI. */
const PLAYGAMA_CONFIG = {
  disableLoadingLogo: true,
  sendAnalyticsEvents: false,
  advertisement: { useBuiltInErrorPopup: false },
};

function html(platform: string): Plugin {
  const sdk = SDK_SCRIPT[platform];
  if (!sdk) throw new Error(`unknown VITE_PLATFORM: ${platform}`);
  return {
    name: 'game-html',
    transformIndexHtml: (src) => src.replace(/%GAME_TITLE%/g, GAME_TITLE).replace('%PLATFORM_SDK%', `<script src="${sdk}"></script>`),
    generateBundle() {
      if (platform === 'playgama') {
        this.emitFile({ type: 'asset', fileName: 'playgama-bridge-config.json', source: JSON.stringify(PLAYGAMA_CONFIG, null, 2) + '\n' });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: './',
    plugins: [html(env.VITE_PLATFORM || 'crazygames')],
    build: {
      target: 'es2020',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 900,
      modulePreload: { polyfill: false },
      reportCompressedSize: false,
      manifest: true,
    },
  };
});
