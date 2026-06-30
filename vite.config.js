import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react()
  ],
  build: {
    lib: {
      entry: 'src/main.jsx',
      name: 'TaggedRequestLogger',
      formats: ['iife'], // 浏览器可直接运行的立即执行函数格式
      fileName: () => 'content.js'
    },
    outDir: '.', // 输出到项目根目录
    emptyOutDir: false, // 严禁清空根目录 (防止删掉图片与 manifest.json)
    rollupOptions: {
      output: {
        extend: true,
        entryFileNames: 'content.js',
        assetFileNames: '[name].[ext]'
      }
    }
  },
  define: {
    // 避免在注入页面执行时因 process.env 未定义而崩溃
    'process.env.NODE_ENV': JSON.stringify('production')
  }
});
