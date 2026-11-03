import { Router } from 'express';
import { pool, transaction } from './db.js';
import { requireUser } from './auth.js';
import { ownedItem } from './items.js';
import { fail, field, id, positive } from './validation.js';

export const economy = Router();
function requestKey(req) {
  const key = req.body.request_key;
  if (typeof key !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(key))
    fail(400, '요청 번호가 올바르지 않습니다. 다시 시도해 주세요.');
  return key;
}
// 재시도에서는 저장된 요청의 내용까지 확인한다. 키만 같고 매물이나 수량이 다르면 재사용할 수 없다.
function replay(row, inputs) {
  if (!row) return false;
  if (Object.entries(inputs).some(([key, value]) => row[key] !== value))
    fail(409, '다른 요청에 사용된 요청 번호입니다.');
  return true;
}
async function addStock(db, userId, itemId, quantity) {
  await db.execute(
    'INSERT INTO inventories (user_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?',
    [userId, itemId, quantity, quantity],
  );
}
function write(action) {
  return async (req, res) => {
    const result = await transaction(async (db) => {
      const user = await requireUser(db, req);
      return action(db, user, req);
    }, true);
    res.json(result || { ok: true });
  };
}

economy.post(
  '/production',
  write(async (db, user, req) => {
    const itemId = id(req.body.item_id);
    const quantity = positive(req.body.quantity, '생산 수량');
    const key = requestKey(req);
    const [past] = await db.execute(
      'SELECT * FROM production_logs WHERE producer_id=? AND request_key=?',
      [user.user_id, key],
    );
    if (replay(past[0], { item_id: itemId, quantity }))
      return { production_id: past[0].production_id };
    const item = await ownedItem(db, user.user_id, itemId);
    if (!Number.isSafeInteger(quantity + item.total_produced))
      fail(400, '누적 생산 가능 범위를 초과했습니다.');
    // 누적 생산량, 제작자의 재고, 생산 기록을 같은 트랜잭션에 넣어 셋 모두 성공할 때만 저장한다.
    await db.execute(
      'UPDATE items SET total_produced=total_produced+?,first_produced_at=COALESCE(first_produced_at,NOW()) WHERE item_id=?',
      [quantity, itemId],
    );
    await addStock(db, user.user_id, itemId, quantity);
    const [result] = await db.execute(
      'INSERT INTO production_logs (item_id,producer_id,quantity,request_key) VALUES (?,?,?,?)',
      [itemId, user.user_id, quantity, key],
    );
    return { production_id: result.insertId };
  }),
);
economy.get('/production', async (req, res) => {
  const user = await requireUser(pool, req);
  const [rows] = await pool.execute(
    'SELECT p.*, i.name FROM production_logs p JOIN items i ON i.item_id=p.item_id WHERE producer_id=? ORDER BY production_id DESC',
    [user.user_id],
  );
  res.json(rows);
});
economy.get('/inventory', async (req, res) => {
  const user = await requireUser(pool, req);
  const [rows] = await pool.execute(
    'SELECT v.*, (quantity-reserved_quantity) AS available, i.name,i.category,i.image_url,i.status,u.nickname FROM inventories v JOIN items i ON i.item_id=v.item_id JOIN users u ON u.user_id=i.creator_id WHERE v.user_id=? AND v.quantity>0 ORDER BY v.updated_at DESC',
    [user.user_id],
  );
  res.json(rows);
});
economy.patch(
  '/inventory/:id',
  write(async (db, user, req) => {
    const itemId = id(req.params.id);
    const [rows] = await db.execute(
      'SELECT user_id FROM inventories WHERE item_id=? AND user_id=? AND quantity>0',
      [itemId, user.user_id],
    );
    if (!rows.length) fail(404, '보유한 아이템을 찾을 수 없습니다.');
    await db.execute('UPDATE inventories SET memo=? WHERE item_id=? AND user_id=?', [
      field(req.body.memo, '메모', 300, false),
      itemId,
      user.user_id,
    ]);
  }),
);

const listingSelect =
  'SELECT l.*, i.name,i.image_url,i.status AS item_status,i.category, c.nickname AS creator, s.nickname AS seller FROM listings l JOIN items i ON i.item_id=l.item_id JOIN users c ON c.user_id=i.creator_id JOIN users s ON s.user_id=l.seller_id';
economy.get('/market', async (req, res) => {
  const order = req.query.sort === 'price' ? 'l.unit_price,l.listing_id DESC' : 'l.listing_id DESC';
  const [rows] = await pool.query(listingSelect + ' WHERE l.status="ACTIVE" ORDER BY ' + order);
  res.json(rows);
});
economy.get('/my-listings', async (req, res) => {
  const user = await requireUser(pool, req);
  const [rows] = await pool.execute(
    listingSelect + ' WHERE seller_id=? ORDER BY l.listing_id DESC',
    [user.user_id],
  );
  res.json(rows);
});
economy.post(
  '/market',
  write(async (db, user, req) => {
    const itemId = id(req.body.item_id);
    const quantity = positive(req.body.quantity, '판매 수량');
    const price = positive(req.body.unit_price, '개당 가격');
    const key = requestKey(req);
    const [past] = await db.execute('SELECT * FROM listings WHERE seller_id=? AND request_key=?', [
      user.user_id,
      key,
    ]);
    if (replay(past[0], { item_id: itemId, initial_quantity: quantity, unit_price: price }))
      return { listing_id: past[0].listing_id };
    // 판매 예약은 보유량에 포함된다. 이미 예약된 수량을 빼고도 충분할 때만 예약을 늘린다.
    const [reserved] = await db.execute(
      'UPDATE inventories SET reserved_quantity=reserved_quantity+? WHERE user_id=? AND item_id=? AND quantity-reserved_quantity>=?',
      [quantity, user.user_id, itemId, quantity],
    );
    if (!reserved.affectedRows) fail(409, '판매 가능한 수량이 부족합니다.');
    const [result] = await db.execute(
      'INSERT INTO listings (item_id,seller_id,unit_price,initial_quantity,remaining_quantity,request_key) VALUES (?,?,?,?,?,?)',
      [itemId, user.user_id, price, quantity, quantity, key],
    );
    return { listing_id: result.insertId };
  }),
);
economy.delete(
  '/market/:id',
  write(async (db, user, req) => {
    const [rows] = await db.execute('SELECT * FROM listings WHERE listing_id=?', [
      id(req.params.id),
    ]);
    const listing = rows[0];
    if (!listing) fail(404, '매물을 찾을 수 없습니다.');
    if (listing.seller_id !== user.user_id) fail(403, '판매자만 매물을 취소할 수 있습니다.');
    if (listing.status !== 'ACTIVE') return;
    await db.execute(
      'UPDATE inventories SET reserved_quantity=reserved_quantity-? WHERE user_id=? AND item_id=?',
      [listing.remaining_quantity, user.user_id, listing.item_id],
    );
    await db.execute('UPDATE listings SET status="CANCELED" WHERE listing_id=?', [
      listing.listing_id,
    ]);
  }),
);

economy.post(
  '/market/:id/buy',
  write(async (db, buyer, req) => {
    const listingId = id(req.params.id);
    const quantity = positive(req.body.quantity, '구매 수량');
    const key = requestKey(req);
    const [past] = await db.execute('SELECT * FROM trades WHERE buyer_id=? AND request_key=?', [
      buyer.user_id,
      key,
    ]);
    if (replay(past[0], { listing_id: listingId, quantity })) return { trade_id: past[0].trade_id };
    const [rows] = await db.execute(
      'SELECT l.*,i.name FROM listings l JOIN items i ON i.item_id=l.item_id WHERE listing_id=?',
      [listingId],
    );
    const listing = rows[0];
    if (!listing || listing.status !== 'ACTIVE' || quantity > listing.remaining_quantity)
      fail(409, '남은 판매 수량을 확인해 주세요.');
    if (listing.seller_id === buyer.user_id) fail(403, '내 매물은 구매할 수 없습니다.');
    const total = listing.unit_price * quantity;
    if (!Number.isSafeInteger(total) || total > buyer.gold_balance)
      fail(409, '구매할 골드가 부족합니다.');
    const [sellers] = await db.execute(
      'SELECT gold_balance FROM users WHERE user_id=? AND status="ACTIVE"',
      [listing.seller_id],
    );
    if (!sellers.length || !Number.isSafeInteger(sellers[0].gold_balance + total))
      fail(409, '판매자가 결제를 받을 수 없습니다.');
    // 가격은 서버에 저장된 단가로 계산한다. 골드 이동, 재고 이동, 매물 잔량, 거래 내역을 함께 확정한다.
    await db.execute('UPDATE users SET gold_balance=gold_balance-? WHERE user_id=?', [
      total,
      buyer.user_id,
    ]);
    await db.execute('UPDATE users SET gold_balance=gold_balance+? WHERE user_id=?', [
      total,
      listing.seller_id,
    ]);
    await db.execute(
      'UPDATE inventories SET quantity=quantity-?,reserved_quantity=reserved_quantity-? WHERE user_id=? AND item_id=?',
      [quantity, quantity, listing.seller_id, listing.item_id],
    );
    await addStock(db, buyer.user_id, listing.item_id, quantity);
    const remaining = listing.remaining_quantity - quantity;
    await db.execute('UPDATE listings SET remaining_quantity=?,status=? WHERE listing_id=?', [
      remaining,
      remaining ? 'ACTIVE' : 'SOLD_OUT',
      listingId,
    ]);
    const [result] = await db.execute(
      'INSERT INTO trades (listing_id,item_id,buyer_id,seller_id,quantity,unit_price,total_price,item_name_snapshot,request_key) VALUES (?,?,?,?,?,?,?,?,?)',
      [
        listingId,
        listing.item_id,
        buyer.user_id,
        listing.seller_id,
        quantity,
        listing.unit_price,
        total,
        listing.name,
        key,
      ],
    );
    return { trade_id: result.insertId };
  }),
);
economy.get('/trades', async (req, res) => {
  const user = await requireUser(pool, req);
  const [rows] = await pool.execute(
    'SELECT t.*,b.nickname AS buyer,s.nickname AS seller FROM trades t JOIN users b ON b.user_id=t.buyer_id JOIN users s ON s.user_id=t.seller_id WHERE t.buyer_id=? OR t.seller_id=? ORDER BY t.trade_id DESC',
    [user.user_id, user.user_id],
  );
  res.json(rows);
});
