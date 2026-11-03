import { Router } from 'express';
import { pool, transaction } from './db.js';
import { requireUser } from './auth.js';
import { fail, field, id } from './validation.js';

export const items = Router();
const categories = ['장비', '의상', '장식', '수집품', '기타'];
// 최초 제작자 번호를 회원 번호와 연결해 공개 정보만 반환한다. 닉네임 변경은 도감에도 바로 반영된다.
const catalog = 'SELECT i.*, u.nickname, u.bio FROM items i JOIN users u ON i.creator_id=u.user_id';
const active = ' WHERE i.status="ACTIVE" AND u.status="ACTIVE"';
items.get('/', async (req, res) => {
  const params = [];
  let condition = active;
  if (req.query.creator) {
    condition += ' AND u.user_id=?';
    params.push(id(req.query.creator));
  }
  const [rows] = await pool.execute(
    catalog + condition + ' ORDER BY i.created_at DESC,i.item_id DESC',
    params,
  );
  res.json(rows);
});
items.get('/:id', async (req, res) => {
  const [rows] = await pool.execute(catalog + ' WHERE i.item_id=?', [id(req.params.id)]);
  if (!rows.length) fail(404, '아이템을 찾을 수 없습니다.');
  res.json(rows[0]);
});
function itemInfo(body) {
  if (!categories.includes(body.category)) fail(400, '분류를 선택해 주세요.');
  const description = field(body.description, '설명', 2000);
  const url = field(body.image_url, '이미지 주소', 2048, false);
  if (url && (!URL.canParse(url) || !['http:', 'https:'].includes(new URL(url).protocol)))
    fail(400, '이미지 주소는 http 또는 https로 시작해야 합니다.');
  return [body.category, description, url];
}
items.post('/', async (req, res) => {
  const itemId = await transaction(async (db) => {
    const user = await requireUser(db, req);
    const name = field(req.body.name, '아이템 이름', 100);
    const key = field(
      name.normalize('NFKC').replace(/\s+/gu, '').toLowerCase(),
      '아이템 식별 이름',
      100,
    );
    const info = itemInfo(req.body);
    try {
      const [result] = await db.execute(
        'INSERT INTO items (creator_id,name,name_key,category,description,image_url) VALUES (?,?,?,?,?,?)',
        [user.user_id, name, key, ...info],
      );
      return result.insertId;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      const [rows] = await db.execute(catalog + ' WHERE i.name_key=?', [key]);
      fail(409, rows[0].nickname + ' 님이 이미 등록한 원본입니다 (' + rows[0].name + ').');
    }
  }, true);
  res.status(201).json({ item_id: itemId });
});

export async function ownedItem(db, userId, itemId) {
  const [rows] = await db.execute('SELECT * FROM items WHERE item_id=?', [itemId]);
  if (!rows.length || rows[0].status !== 'ACTIVE')
    fail(404, '제작 가능한 원본을 찾을 수 없습니다.');
  // 요청 본문의 작성자 대신 로그인한 회원 번호와 원본에 기록된 최초 제작자 번호를 비교한다.
  if (rows[0].creator_id !== userId) fail(403, '최초 제작자만 이 원본을 변경할 수 있습니다.');
  return rows[0];
}
items.patch('/:id', async (req, res) => {
  await transaction(async (db) => {
    const user = await requireUser(db, req);
    const item = await ownedItem(db, user.user_id, id(req.params.id));
    const [category, description, url] = itemInfo(req.body);
    if (item.first_produced_at && (category !== item.category || url !== item.image_url))
      fail(409, '첫 생산 이후에는 분류와 이미지를 변경할 수 없습니다.');
    await db.execute('UPDATE items SET category=?,description=?,image_url=? WHERE item_id=?', [
      category,
      description,
      url,
      item.item_id,
    ]);
  }, true);
  res.sendStatus(204);
});
items.delete('/:id', async (req, res) => {
  await transaction(async (db) => {
    const user = await requireUser(db, req);
    const item = await ownedItem(db, user.user_id, id(req.params.id));
    // 이름 키를 남겨 재등록을 막고 기존에 생산한 아이템과 거래 기록을 유지한다.
    await db.execute('UPDATE items SET status="RETIRED",deleted_at=NOW() WHERE item_id=?', [
      item.item_id,
    ]);
  }, true);
  res.sendStatus(204);
});
