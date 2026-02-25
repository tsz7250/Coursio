import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// Electron 透過 file:// 協定載入時，<script crossorigin> 會觸發 CORS 檢查失敗
// 此 plugin 將 Vite 在 dist/index.html 中產生的 crossorigin 屬性全部移除
function removeElectronCrossorigin() {
  return {
    name: 'remove-electron-crossorigin',
    transformIndexHtml(html) {
      return html
        .replace(/<script\s+type="module"\s+crossorigin\s+/g, '<script type="module" ')
        .replace(/<link\s+rel="modulepreload"\s+crossorigin(\s+)/g, '<link rel="modulepreload"$1')
        .replace(/<link\s+rel="stylesheet"\s+crossorigin(\s+)/g, '<link rel="stylesheet"$1');
    },
  };
}

export default defineConfig({
  root: path.resolve(__dirname, 'renderer'),
  base: './',
  plugins: [vue(), removeElectronCrossorigin()],
  build: {
    outDir: path.resolve(__dirname, 'renderer', 'dist'),
    emptyOutDir: true,
    // Electron 不需要 module preload polyfill
    modulePreload: { polyfill: false },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        silenceDeprecations: ['import', 'global-builtin', 'slash-div', 'mixed-decls']
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'renderer'),
    },
  },
  // 開發 server 設定（用於 Electron loadURL）
  server: {
    port: 5173,
    strictPort: true,
  },
});
