import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'chori_20510',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'chori_class_20510',
  charset: 'utf8mb4',
  connectionLimit: 10,
  dateStrings: true,
  connectTimeout: 10000,
});

export async function initialize() {
  const sql = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  for (const statement of sql.split(';').filter((value) => value.trim())) {
    await pool.query(statement);
  }
  // 기존 데이터는 보존하고 새 기능에 필요한 열만 추가한다. 아래 SQL은 고정된 값만 사용한다.
  for (const [table, column, definition] of [
    ['users', 'recovery_code_hash', 'CHAR(64)'],
    ['listings', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
  ]) {
    const [columns] = await pool.query('SHOW COLUMNS FROM ?? LIKE ?', [table, column]);
    if (columns.length) continue;
    try {
      await pool.query('ALTER TABLE ?? ADD COLUMN ?? ' + definition, [table, column]);
    } catch (error) {
      // 두 서버가 동시에 처음 실행되어 다른 쪽이 먼저 열을 추가한 경우만 허용한다.
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');
}

export async function transaction(work, ordered = false) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    // 동시에 온 생산·거래·탈퇴 요청은 같은 행을 먼저 잠근다. 먼저 시작한 변경을 확정한 뒤 다음 요청이 검사한다.
    if (ordered) await db.query('SELECT id FROM write_lock WHERE id=1 FOR UPDATE');
    const result = await work(db);
    await db.commit();
    return result;
  } catch (error) {
    // 여러 테이블 중 하나라도 실패하면 골드와 수량을 포함해 전체를 되돌린다.
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
