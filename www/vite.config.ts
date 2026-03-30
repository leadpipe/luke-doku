import {defineConfig} from 'vite';
import checker from 'vite-plugin-checker';
import eslint from 'vite-plugin-eslint';
import {VitePWA} from 'vite-plugin-pwa';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

export default defineConfig(({mode}) => ({
  server: {
    port: 8080,
    fs: {
      allow: ['..'],
    },
  },
  plugins: [
    {
      name: 'debug-mode',
      transformIndexHtml(html) {
        return html.replaceAll(
          '$debugMode',
          (mode === 'development').toString(),
        );
      },
    },
    eslint({
      failOnWarning: true,
      include: 'src/**/*.ts',
    }),
    checker({
      typescript: true,
    }),
    wasm(),
    topLevelAwait(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        dontCacheBustURLsMatching: /^[0-9a-f]{20}\./,
      },
    }),
  ],
}));
