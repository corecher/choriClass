import { Router } from 'express';
import { pool } from './db.js';

export const reports = Router();

// JOIN 결과 1은 items.js의 제작자별 도감이다. 결과 2는 같은 두 테이블로 만든 제작자 통계다.
export const creatorStatsSql = `
  SELECT u.user_id, u.nickname, u.bio,
         COUNT(i.item_id) AS item_count,
         COALESCE(SUM(i.total_produced), 0) AS total_produced,
         MAX(i.created_at) AS latest_item_at
  FROM users AS u
  LEFT JOIN items AS i
    ON i.creator_id = u.user_id AND i.status = 'ACTIVE'
  WHERE u.status = 'ACTIVE'
  GROUP BY u.user_id, u.nickname, u.bio
  ORDER BY item_count DESC, u.user_id ASC
`;
reports.get('/creator-stats', async (req, res) => {
  // LEFT JOIN은 아직 원본이 없는 회원도 0개로 표시한다. 이메일·골드 등 개인 정보는 제외한다.
  const [rows] = await pool.query(creatorStatsSql);
  res.json(
    rows.map((row) => ({
      ...row,
      item_count: Number(row.item_count),
      total_produced: String(row.total_produced),
    })),
  );
});
