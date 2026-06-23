import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// 多页:主窗口 index.html + 桌面组件/悬浮窗 widget.html(各自独立打包,组件不拖入 Sidebar/Chat)。
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        widget: resolve(__dirname, 'widget.html'),
      },
    },
  },
})
