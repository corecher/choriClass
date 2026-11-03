import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const client = fileURLToPath(new URL('./client/', import.meta.url));
const packages = fileURLToPath(new URL('./node_modules/', import.meta.url));
export default defineConfig({
  root: client,
  // 개발 화면도 React 파일과 라이브러리만 제공한다. MySQL 데이터와 서버 설정은 이 경로 밖에 있다.
  server: { fs: { strict: true, allow: [client, packages] } },
  build: { outDir: fileURLToPath(new URL('./dist/', import.meta.url)), emptyOutDir: true },
});
