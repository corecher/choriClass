import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import mysql from 'mysql2/promise';

const database = process.env.TEST_DB_NAME || 'chori_class_test';
if (!database.endsWith('_test')) throw new Error('테스트 전용 DB 이름은 _test로 끝나야 합니다.');
let server, base, db;
before(async () => {
  db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
  });
  server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, DB_NAME: database, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    server.once('exit', (code) => reject(new Error('테스트 서버 시작 실패 ' + code)));
    server.once('error', reject);
    createInterface({ input: server.stdout }).on('line', (line) => {
      const url = line.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (url) {
        base = url[0] + '/api/';
        resolve();
      }
    });
    server.stderr.pipe(process.stderr);
  });
});
after(async () => {
  server?.kill();
  await db?.end();
});
async function call(path, method = 'GET', body, cookie) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = response.status === 204 ? null : await response.json();
  return {
    status: response.status,
    data: json,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}
const pw = 'collector-pass8';
function account(nickname) {
  return { email: randomUUID() + '@example.test', nickname, password: pw };
}
test('동시 가입, 이메일 정규화, bcrypt 저장, 초기 골드 및 로그인', async () => {
  const body = account('가입 검사');
  assert.equal((await call('auth/signup', 'POST', { ...body, email: 'invalid' })).status, 400);
  assert.equal((await call('auth/signup', 'POST', { ...body, password: '짧음' })).status, 400);
  assert.equal(
    (await call('auth/signup', 'POST', { ...body, password: '한'.repeat(25) })).status,
    400,
  );
  const responses = await Promise.all([
    call('auth/signup', 'POST', { ...body, email: body.email.toUpperCase(), gold_balance: 99999 }),
    call('auth/signup', 'POST', body),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  const saved = responses.find((r) => r.status === 201);
  assert.equal(saved.data.user.gold_balance, 1000);
  const [rows] = await db.execute(
    'SELECT email,password_hash,gold_balance FROM users WHERE email=?',
    [body.email],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, body.email);
  assert.match(rows[0].password_hash, /^\$2[aby]\$12\$/);
  assert.equal(rows[0].gold_balance, 1000);
  assert.ok(!('password_hash' in saved.data.user));
  assert.equal((await call('auth/me', 'GET', null, saved.cookie)).data.user.email, body.email);
  assert.equal((await call('auth/logout', 'POST', null, saved.cookie)).status, 204);
  assert.equal((await call('auth/me', 'GET', null, saved.cookie)).data.user, null);
  assert.equal((await call('auth/login', 'POST', { ...body, password: 'incorrect' })).status, 401);
  const login = await call('auth/login', 'POST', body);
  assert.equal(login.data.user.gold_balance, 1000);
  assert.equal(
    (
      await call(
        'auth/me',
        'PATCH',
        {
          nickname: '변경',
          bio: '프로필',
          currentPassword: '틀린 비밀번호',
          newPassword: 'changed-pass',
        },
        login.cookie,
      )
    ).status,
    403,
  );
  const edit = await call(
    'auth/me',
    'PATCH',
    { nickname: '변경', bio: '프로필', currentPassword: pw, newPassword: 'changed-pass' },
    login.cookie,
  );
  assert.equal(edit.status, 200);
  assert.equal((await call('auth/me', 'GET', null, login.cookie)).data.user, null);
  assert.equal((await call('auth/login', 'POST', body)).status, 401);
  assert.equal(
    (
      await call(
        'auth/me',
        'DELETE',
        { currentPassword: 'changed-pass', confirm: true },
        edit.cookie,
      )
    ).status,
    204,
  );
  assert.equal((await call('auth/me', 'GET', null, edit.cookie)).data.user, null);
  assert.equal(
    (await call('auth/login', 'POST', { ...body, password: 'changed-pass' })).status,
    401,
  );
});
test('작성자 권한과 JOIN, 생산 재시도, 판매·구매 동시성, 탈퇴 후 보유분 재판매', async () => {
  const a = await call('auth/signup', 'POST', account('제작자 A'));
  const b = await call('auth/signup', 'POST', account('수집가 B'));
  const c = await call('auth/signup', 'POST', account('수집가 C'));
  const name = 'Crystal ' + randomUUID();
  const item = { name, category: '수집품', description: '별빛', image_url: '' };
  assert.equal((await call('items', 'POST', item)).status, 401);
  const registration = await Promise.all([
    call('items', 'POST', item, a.cookie),
    call('items', 'POST', { ...item, name: name.toUpperCase().replaceAll(' ', '') }, a.cookie),
  ]);
  assert.deepEqual(registration.map((r) => r.status).sort(), [201, 409]);
  const itemId = registration.find((r) => r.status === 201).data.item_id;
  assert.equal((await call('items/' + itemId, 'PATCH', item, b.cookie)).status, 403);
  assert.equal((await call('items/' + itemId, 'DELETE', null, b.cookie)).status, 403);
  assert.equal(
    (await call('items/' + itemId, 'PATCH', { ...item, description: '수정' }, a.cookie)).status,
    204,
  );
  const prod = { item_id: itemId, quantity: 10, request_key: randomUUID() };
  assert.equal((await call('production', 'POST', prod, b.cookie)).status, 403);
  const attempts = await Promise.all([
    call('production', 'POST', prod, a.cookie),
    call('production', 'POST', prod, a.cookie),
  ]);
  assert.equal(attempts[0].data.production_id, attempts[1].data.production_id);
  assert.equal((await call('production', 'POST', { ...prod, quantity: 1 }, a.cookie)).status, 409);
  assert.equal(
    (await call('items/' + itemId, 'PATCH', { ...item, category: '장비' }, a.cookie)).status,
    409,
  );
  await call('auth/me', 'PATCH', { nickname: '새 제작자', bio: '공개 소개' }, a.cookie);
  const joined = (await call('items?creator=' + a.data.user.user_id)).data[0];
  assert.equal(joined.nickname, '새 제작자');
  assert.equal(joined.bio, '공개 소개');
  assert.equal(joined.total_produced, 10);
  assert.ok(!('email' in joined));
  assert.ok(!('gold_balance' in joined));
  const listing = { item_id: itemId, quantity: 6, unit_price: 100, request_key: randomUUID() };
  const sale = await call('market', 'POST', listing, a.cookie);
  assert.equal(sale.status, 200);
  const listingId = sale.data.listing_id;
  assert.equal((await call('market', 'POST', listing, a.cookie)).data.listing_id, listingId);
  assert.equal(
    (await call('market', 'POST', { ...listing, quantity: 5, request_key: randomUUID() }, a.cookie))
      .status,
    409,
  );
  const buyPath = 'market/' + listingId + '/buy',
    buy = { quantity: 2, request_key: randomUUID() };
  assert.equal((await call(buyPath, 'POST', buy, a.cookie)).status, 403);
  const bought = await call(buyPath, 'POST', buy, b.cookie);
  assert.equal(bought.status, 200);
  assert.equal((await call(buyPath, 'POST', buy, b.cookie)).data.trade_id, bought.data.trade_id);
  assert.equal((await call('auth/me', 'GET', null, b.cookie)).data.user.gold_balance, 800);
  assert.equal((await call('auth/me', 'GET', null, a.cookie)).data.user.gold_balance, 1200);
  assert.equal((await call('market/' + listingId, 'DELETE', null, b.cookie)).status, 403);
  await call('market/' + listingId, 'DELETE', null, a.cookie);
  const stock = (await call('inventory', 'GET', null, a.cookie)).data[0];
  assert.equal(stock.quantity, 8);
  assert.equal(stock.reserved_quantity, 0);
  const last = (
    await call('market', 'POST', { ...listing, quantity: 1, request_key: randomUUID() }, a.cookie)
  ).data.listing_id;
  const race = await Promise.all(
    [b, c].map((u) =>
      call('market/' + last + '/buy', 'POST', { quantity: 1, request_key: randomUUID() }, u.cookie),
    ),
  );
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  const expensive = (
    await call(
      'market',
      'POST',
      { ...listing, quantity: 1, unit_price: 3000, request_key: randomUUID() },
      a.cookie,
    )
  ).data.listing_id;
  const before = (await call('inventory', 'GET', null, b.cookie)).data[0];
  assert.equal(
    (
      await call(
        'market/' + expensive + '/buy',
        'POST',
        { quantity: 1, request_key: randomUUID() },
        b.cookie,
      )
    ).status,
    409,
  );
  assert.equal((await call('inventory', 'GET', null, b.cookie)).data[0].quantity, before.quantity);
  const resale = (
    await call(
      'market',
      'POST',
      { item_id: itemId, quantity: 1, unit_price: 20, request_key: randomUUID() },
      b.cookie,
    )
  ).data.listing_id;
  assert.equal(
    (await call('auth/me', 'DELETE', { currentPassword: pw, confirm: true }, a.cookie)).status,
    204,
  );
  assert.equal((await call('items?creator=' + a.data.user.user_id)).data.length, 0);
  assert.equal((await call('items/' + itemId)).data.status, 'RETIRED');
  assert.equal((await call('items', 'POST', item, b.cookie)).status, 409);
  assert.equal(
    (
      await call(
        'market/' + resale + '/buy',
        'POST',
        { quantity: 1, request_key: randomUUID() },
        c.cookie,
      )
    ).status,
    200,
  );
  assert.ok(
    (await call('trades', 'GET', null, b.cookie)).data.some(
      (t) => t.seller_id === b.data.user.user_id,
    ),
  );
  const [totals] = await db.execute(
    'SELECT SUM(quantity) AS total FROM inventories WHERE item_id=?',
    [itemId],
  );
  assert.equal(Number(totals[0].total), 10);
  for (const u of [b, c])
    await call('auth/me', 'DELETE', { currentPassword: pw, confirm: true }, u.cookie);
});
