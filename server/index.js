import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialize, pool } from './db.js';
import { accounts } from './auth.js';
import { items } from './items.js';
import { economy } from './economy.js';

const app = express();
const root = fileURLToPath(new URL('../', import.meta.url));
app.disable('x-powered-by');
app.use(['/.local', '/.env', '/.npm-cache'], (req, res) => res.sendStatus(404));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (
    !['GET', 'HEAD'].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== req.protocol + '://' + req.headers.host
  )
    return res.status(403).json({ message: '같은 사이트에서 다시 시도해 주세요.' });
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use('/api', (req, res, next) => {
  req.body ??= {};
  next();
});
app.use('/api/auth', accounts);
app.use('/api/items', items);
app.use('/api', economy);
app.use('/api', (req, res) => res.status(404).json({ message: '요청 경로를 찾을 수 없습니다.' }));
app.use((error, req, res, next) => {
  const status = error.status || 500;
  if (status >= 500) console.error('API 오류:', error.code || error.name);
  const message =
    status >= 500
      ? '저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
      : error.type === 'entity.parse.failed'
        ? '입력 형식이 올바르지 않습니다.'
        : error.message;
  res.status(status).json({ message });
});
try {
  await initialize();
  if (process.argv.includes('--dev')) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(root, 'dist')));
    app.get('/{*route}', (req, res) => res.sendFile(path.join(root, 'dist/index.html')));
  }
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, '127.0.0.1', () =>
    console.log('취향창고 http://127.0.0.1:' + server.address().port),
  );
} catch (error) {
  console.error(
    '시작 실패:',
    error.code || error.message,
    '— MySQL 실행 상태와 .env 설정을 확인해 주세요.',
  );
  await pool.end();
  process.exitCode = 1;
}
