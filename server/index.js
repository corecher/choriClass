import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialize, pool } from './db.js';
import { accounts } from './auth.js';
import { items } from './items.js';
import { economy } from './economy.js';
import { reports } from './reports.js';

const app = express();
const server = createHttpServer(app);
let vite;
const port = Number(process.env.PORT ?? 3000);
const root = fileURLToPath(new URL('../', import.meta.url));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (!process.argv.includes('--dev')) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  }
  next();
});
app.use(['/.local', '/.env', '/.npm-cache'], (req, res) => res.sendStatus(404));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (
    !['GET', 'HEAD'].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== req.protocol + '://' + req.headers.host
  )
    return res.status(403).json({ message: '같은 사이트에서 다시 시도해 주세요.' });
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['sec-fetch-site'] === 'cross-site')
    return res.status(403).json({ message: '같은 사이트에서 다시 시도해 주세요.' });
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use('/api', (req, res, next) => {
  if (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body)))
    return res.status(400).json({ message: '입력 형식이 올바르지 않습니다.' });
  req.body ??= {};
  next();
});
app.use('/api/auth', accounts);
app.use('/api/items', items);
app.use('/api/reports', reports);
app.use('/api', economy);
app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ app: 'choriClass', status: 'ok' });
});
app.use('/api', (req, res) => res.status(404).json({ message: '요청 경로를 찾을 수 없습니다.' }));
app.use((error, req, res, next) => {
  const status = error.status >= 400 && error.status < 600 ? error.status : 500;
  if (status >= 500) console.error('API 오류:', error.code || error.name);
  const message =
    status >= 500
      ? '저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
      : status === 413
        ? '입력 내용이 너무 큽니다. 내용을 줄여 주세요.'
        : error.type === 'entity.parse.failed'
          ? '입력 형식이 올바르지 않습니다.'
          : error.message;
  res.status(status).json({ message });
});
async function closeResources() {
  // 시작 실패 때도 Vite의 파일 감시와 개발용 연결을 닫아 다음 실행에 포트가 남지 않게 한다.
  if (vite) await vite.close();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
async function runningGameUrl() {
  if (port === 0) return null;
  const url = 'http://127.0.0.1:' + port;
  try {
    // 다른 프로그램이 포트를 사용 중일 수도 있으므로 정상 동작하는 choriClass인지 먼저 확인한다.
    const response = await fetch(url + '/api/health', {
      signal: AbortSignal.timeout(1500),
      redirect: 'error',
    });
    const data = await response.json();
    return response.ok && data.app === 'choriClass' && data.status === 'ok' ? url : null;
  } catch {
    return null;
  }
}
function showRunningGame(url) {
  console.log('choriClass가 이미 실행 중입니다. 브라우저에서 아래 주소를 열어 주세요.\n' + url);
}
try {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('PORT는 0~65535 사이 정수여야 합니다.');
  const existing = await runningGameUrl();
  if (existing) {
    showRunningGame(existing);
    await closeResources();
  } else {
    await initialize();
    if (process.argv.includes('--dev')) {
      const { createServer: createViteServer } = await import('vite');
      vite = await createViteServer({
        // 개발용 WebSocket도 이 HTTP 서버를 사용한다. 별도 24678 포트를 열지 않는다.
        server: { middlewareMode: true, hmr: { server } },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(path.join(root, 'dist')));
      app.get('/{*route}', (req, res) => res.sendFile(path.join(root, 'dist/index.html')));
    }
    // Express 5의 app.listen 콜백은 실패 때도 호출된다. HTTP 서버의 성공 이벤트를 기다린 뒤 주소를 읽는다.
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('웹 서버 주소를 확인할 수 없습니다.');
    console.log('choriClass http://127.0.0.1:' + address.port);
    // 종료할 때 새 요청을 멈추고 DB 연결도 반환해 학교 PC에서 다시 실행하기 쉽게 한다.
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, async () => {
        await closeResources();
        process.exit(0);
      });
    }
  }
} catch (error) {
  let exitCode = 1;
  if (error.code === 'EADDRINUSE') {
    // 두 실행 요청이 동시에 도착한 경우에도 먼저 켜진 게임을 다시 확인한다.
    const existing = await runningGameUrl();
    if (existing) {
      showRunningGame(existing);
      exitCode = 0;
    } else {
      console.error(
        port + '번 포트를 이미 사용 중입니다. 기존 실행 창을 종료하거나 .env의 PORT를 바꿔 주세요.',
      );
    }
  } else {
    console.error(
      '시작 실패:',
      error.code || error.message,
      '— MySQL 실행 상태와 .env 설정을 확인해 주세요.',
    );
  }
  await closeResources();
  process.exitCode = exitCode;
}
