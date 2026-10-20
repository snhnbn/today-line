import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // 상대 경로: GitHub Pages의 저장소 하위 주소(https://<계정>.github.io/<저장소>/)에서도 그대로 동작
  base: './',
  plugins: [react()],
})
