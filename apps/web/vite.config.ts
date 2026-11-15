import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    manifest: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // 只把框架层拆成长期缓存 chunk，其余交给 Rollup 按需分包。
        // 注意：不要把 naive-ui / lucide 整体指定成一个 chunk，
        // 否则 lazy 路由（管理端）才用到的组件会被提前打进首屏。
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('/@vue/') ||
            id.includes('/vue/') ||
            id.includes('/vue-router/') ||
            id.includes('/pinia/')
          ) {
            return 'vendor-vue';
          }
          return undefined;
        },
      },
    },
  },
});
