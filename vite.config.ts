import { defineConfig } from 'vite';

const SERVER = 'http://127.0.0.1:3040';

export default defineConfig({
  base: './',
  server: {
    port: 5180,
    // 页面在 5180，账本和模型在 3040：同源转发，SSE 也能直接过。
    proxy: {
      '/api': { target: SERVER, changeOrigin: true },
      '/data': { target: SERVER, changeOrigin: true },
    },
  },
});
