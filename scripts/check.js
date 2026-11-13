import fs from 'node:fs/promises';
import { pool } from '../server/db.js';

try {
  const student = process.env.STUDENT_ID || '20510';
  const name = process.env.DB_NAME || 'chori_class_20510';
  if (!name.endsWith('_' + student))
    throw new Error('DB 이름이 _' + student + '으로 끝나야 합니다.');
  await pool.query('SELECT 1');
  const [tables] = await pool.query('SHOW TABLES');
  const actual = new Set(tables.map((row) => Object.values(row)[0]));
  for (const table of [
    'users',
    'items',
    'inventories',
    'production_logs',
    'listings',
    'trades',
    'sessions',
    'write_lock',
  ]) {
    if (!actual.has(table))
      throw new Error(table + ' 테이블이 없습니다. npm run setup을 먼저 실행하세요.');
  }
  console.log('DB 연결 정상 · ' + name + ' · 필수 테이블 8개 확인');
  try {
    await fs.access('dist/index.html');
    console.log('배포용 화면 빌드 있음 · npm start 사용 가능');
  } catch {
    console.log('개발 실행: npm run dev / 배포용 화면 생성: npm run build');
  }
} catch (error) {
  console.error('실행 준비 확인 실패:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
