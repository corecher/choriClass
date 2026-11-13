import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

// 학교 컴퓨터에서도 실행할 수 있는 초기 설정이다. 관리자 비밀번호는 저장하거나 출력하지 않는다.
try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const nonInteractive = process.argv.includes('--non-interactive');
let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const input = nonInteractive
  ? null
  : createInterface({
      input: process.stdin,
      output,
      terminal: !!process.stdin.isTTY,
    });
async function ask(label, fallback = '', secret = false) {
  if (nonInteractive) return fallback;
  process.stdout.write(label + (fallback && !secret ? ' [' + fallback + ']' : '') + ': ');
  muted = secret;
  try {
    const answer = await input.question('');
    return (secret ? answer : answer.trim()) || fallback;
  } finally {
    muted = false;
    if (secret) process.stdout.write('\n');
  }
}
let admin;
try {
  const student = await ask('학번', process.env.STUDENT_ID || '20510');
  if (!/^\d{3,12}$/.test(student)) throw new Error('학번은 3~12자리 숫자로 입력해 주세요.');
  const host = await ask('MySQL 주소', process.env.DB_HOST || '127.0.0.1');
  const port = Number(await ask('MySQL 포트', process.env.DB_PORT || '3306'));
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('포트는 1~65535 사이 정수여야 합니다.');
  const adminUser = await ask('MySQL 관리자 아이디', process.env.DB_ADMIN_USER || 'root');
  const adminPassword =
    process.env.DB_ADMIN_PASSWORD ?? (await ask('MySQL 관리자 비밀번호', '', true));
  const database = 'chori_class_' + student;
  const testDatabase = 'chori_class_test_' + student;
  const appUser = process.env.DB_USER || 'chori_' + student;
  const oldPassword = process.env.DB_PASSWORD;
  const appPassword =
    oldPassword && !oldPassword.startsWith('replace-')
      ? oldPassword
      : randomBytes(24).toString('hex');
  if (appUser === adminUser)
    throw new Error('앱 계정(DB_USER)은 관리자 계정과 다른 이름으로 지정해 주세요.');
  admin = await mysql.createConnection({
    host,
    port,
    user: adminUser,
    password: adminPassword,
    connectTimeout: 10000,
  });
  // 식별자는 escapeId, 계정과 비밀번호는 파라미터로 이스케이프한다. 기존 DB 데이터는 지우지 않는다.
  for (const name of [database, testDatabase]) {
    await admin.query(
      'CREATE DATABASE IF NOT EXISTS ' +
        mysql.escapeId(name) +
        ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
    );
  }
  await admin.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [
    appUser,
    'localhost',
    appPassword,
  ]);
  for (const name of [database, testDatabase]) {
    await admin.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON ' +
        mysql.escapeId(name) +
        '.* TO ?@?',
      [appUser, 'localhost'],
    );
  }
  // 기존 계정의 비밀번호는 강제로 바꾸지 않는다. 연결에 성공한 설정만 .env로 저장한다.
  const probe = await mysql.createConnection({
    host,
    port,
    user: appUser,
    password: appPassword,
    database,
  });
  await probe.end();
  const values = {
    STUDENT_ID: student,
    DB_HOST: host,
    DB_PORT: String(port),
    DB_NAME: database,
    TEST_DB_NAME: testDatabase,
    DB_USER: appUser,
    DB_PASSWORD: appPassword,
    PORT: process.env.PORT || '3000',
    COOKIE_SECURE: process.env.COOKIE_SECURE || 'false',
  };
  let envText = '';
  try {
    envText = await fs.readFile('.env', 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const [key, value] of Object.entries(values)) {
    const line = key + '=' + JSON.stringify(value);
    const pattern = new RegExp('^' + key + '=.*$', 'm');
    envText = pattern.test(envText)
      ? envText.replace(pattern, () => line)
      : envText.trimEnd() + '\n' + line + '\n';
    process.env[key] = value;
  }
  await fs.writeFile('.env', envText.trimStart(), { mode: 0o600 });
  const { initialize, pool } = await import('../server/db.js');
  try {
    await initialize();
  } finally {
    await pool.end();
  }
  console.log(
    '\n설정 완료: ' +
      database +
      '\n이제 npm run dev를 실행하고 http://127.0.0.1:' +
      values.PORT +
      ' 에 접속하세요.',
  );
} catch (error) {
  console.error('설정 실패:', error.code || error.message);
  console.error(
    'MySQL 실행 상태와 관리자 정보를 확인하세요. 기존 앱 계정이 있으면 .env의 DB_PASSWORD를 그 계정 비밀번호에 맞춰 주세요.',
  );
  process.exitCode = 1;
} finally {
  input?.close();
  if (admin) await admin.end();
}
