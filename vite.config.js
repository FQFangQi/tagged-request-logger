import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

export default defineConfig({
  plugins: [
    react(),
    // 自动将打包后的 css 注入到打包生成的 content.js 文件头部的 style 标签中
    cssInjectedByJsPlugin()
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
