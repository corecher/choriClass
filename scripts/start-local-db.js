import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';

// 이 컴퓨터에 준비한 포터블 MySQL을 다시 여는 명령이다. 다른 컴퓨터에서는 README의 MySQL 설정을 사용한다.
const local = path.resolve('.local');
const folder = 'mysql-8.4.13-winx64';
const port = Number(process.env.DB_PORT || 33317);
try {
  const db = await mysql.createConnection({
    host: '127.0.0.1',
    port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await db.end();
  console.log('프로젝트 MySQL이 이미 실행 중입니다.');
} catch (error) {
  if (error.code !== 'ECONNREFUSED') throw error;
  await fs.access(path.join(local, folder, 'bin', 'mysqld.exe'));
  // Windows MySQL이 한글이나 특수 문자가 있는 경로를 읽도록 임시 폴더에 영문 이름의 연결만 만든다.
  const suffix = createHash('sha256').update(local).digest('hex').slice(0, 12);
  const alias = path.join(os.tmpdir(), 'chori-db-' + suffix);
  try {
    await fs.symlink(local, alias, 'junction');
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  if ((await fs.realpath(alias)).toLowerCase() !== (await fs.realpath(local)).toLowerCase())
    throw new Error('MySQL 데이터 경로를 확인해 주세요.');
  const base = path.join(alias, folder);
  const child = spawn(
    path.join(base, 'bin', 'mysqld.exe'),
    [
      '--no-defaults',
      '--standalone',
      '--basedir=' + base,
      '--datadir=' + path.join(alias, 'mysql-data'),
      '--port=' + port,
      '--bind-address=127.0.0.1',
      '--mysqlx=OFF',
      '--console',
    ],
    { cwd: base, stdio: 'inherit', windowsHide: true },
  );
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
