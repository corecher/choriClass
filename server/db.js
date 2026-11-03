import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'chori',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'chori_class',
  charset: 'utf8mb4',
  connectionLimit: 10,
  dateStrings: true,
});

export async function initialize() {
  const sql = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  for (const statement of sql.split(';').filter((value) => value.trim())) {
    await pool.query(statement);
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
