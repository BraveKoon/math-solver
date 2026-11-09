import { defineConfig } from 'vite';

// iPhone 앱(Capacitor) 안의 화면만 빌드한다. 모델 실행은 네이티브 llama.cpp 플러그인이 담당.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
});
