import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createServer as createHttpServer } from 'node:http';
import mysql from 'mysql2/promise';

const database = process.env.TEST_DB_NAME || 'chori_class_test_20510';
if (!/^chori_class_test(?:_\d+)?$/.test(database) || database === process.env.DB_NAME)
  throw new Error('테스트는 chori_class_test_학번 형식의 별도 DB에서만 실행합니다.');
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
    const timeout = setTimeout(() => reject(new Error('테스트 서버 시작 시간 초과')), 15000);
    timeout.unref();
    server.once('exit', (code) => reject(new Error('테스트 서버 시작 실패 ' + code)));
    server.once('error', reject);
    createInterface({ input: server.stdout }).on('line', (line) => {
      const url = line.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (url) {
        base = url[0] + '/api/';
        clearTimeout(timeout);
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
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
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

function launchProcess(dev, port) {
  const child = spawn(process.execPath, ['server/index.js', ...(dev ? ['--dev'] : [])], {
    env: { ...process.env, DB_NAME: database, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  let onReady;
  let onEnd;
  const ready = new Promise((resolve) => {
    onReady = resolve;
  });
  const ended = new Promise((resolve) => {
    onEnd = resolve;
  });
  child.stdout.on('data', (chunk) => {
    output += chunk;
    const url = output.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (url) onReady(url[0]);
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  child.once('error', (error) => {
    output += error.message;
    onEnd(-1);
  });
  child.once('close', (code) => onEnd(code));
  return { child, ready, ended, output: () => output };
}

async function within(promise, milliseconds = 15000) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('서버 실행 또는 종료 시간 초과')),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function readyUrl(run) {
  return within(
    Promise.race([
      run.ready,
      run.ended.then((code) => {
        throw new Error('테스트 서버 종료 ' + code + ': ' + run.output());
      }),
    ]),
  );
}

async function stopProcess(run) {
  if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill();
  await within(run.ended);
}

test('DB 저장 중 실패해도 구매자의 골드와 판매자의 재고를 모두 롤백', async () => {
  const a = await call('auth/signup', 'POST', account('롤백 판매자'));
  const b = await call('auth/signup', 'POST', account('롤백 구매자'));
  const created = await call(
    'items',
    'POST',
    {
      name: '롤백 ' + randomUUID(),
      category: '기타',
      description: '오류 시 전체 복구 확인',
      image_url: '',
    },
    a.cookie,
  );
  const itemId = created.data.item_id;
  await call(
    'production',
    'POST',
    { item_id: itemId, quantity: 1, request_key: randomUUID() },
    a.cookie,
  );
  const sale = await call(
    'market',
    'POST',
    { item_id: itemId, quantity: 1, unit_price: 100, request_key: randomUUID() },
    a.cookie,
  );
  // 테스트 DB에만 임시 경계 수량을 넣어, 골드 이동 후 구매자 재고 저장에서 CHECK 오류를 유도한다.
  await db.execute('INSERT INTO inventories (user_id,item_id,quantity) VALUES (?,?,?)', [
    b.data.user.user_id,
    itemId,
    Number.MAX_SAFE_INTEGER,
  ]);
  try {
    const buy = await call(
      'market/' + sale.data.listing_id + '/buy',
      'POST',
      { quantity: 1, request_key: randomUUID() },
      b.cookie,
    );
    assert.equal(buy.status, 500);
    const [balances] = await db.execute('SELECT gold_balance FROM users WHERE user_id IN (?,?)', [
      a.data.user.user_id,
      b.data.user.user_id,
    ]);
    assert.ok(balances.every((user) => user.gold_balance === 1000));
    const [[seller]] = await db.execute(
      'SELECT quantity,reserved_quantity FROM inventories WHERE user_id=? AND item_id=?',
      [a.data.user.user_id, itemId],
    );
    assert.equal(seller.quantity, 1);
    assert.equal(seller.reserved_quantity, 1);
    const [[listing]] = await db.execute(
      'SELECT remaining_quantity,status FROM listings WHERE listing_id=?',
      [sale.data.listing_id],
    );
    assert.equal(listing.remaining_quantity, 1);
    assert.equal(listing.status, 'ACTIVE');
    const [[trades]] = await db.execute('SELECT COUNT(*) AS count FROM trades WHERE item_id=?', [
      itemId,
    ]);
    assert.equal(trades.count, 0);
  } finally {
    await db.execute('DELETE FROM inventories WHERE user_id=? AND item_id=?', [
      b.data.user.user_id,
      itemId,
    ]);
    for (const u of [a, b])
      await call('auth/me', 'DELETE', { currentPassword: pw, confirm: true }, u.cookie);
  }
});
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
    call('auth/signup', 'POST', {
      ...body,
      email: body.email.toUpperCase(),
      gold_balance: 99999,
    }),
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
    {
      nickname: '변경',
      bio: '프로필',
      currentPassword: pw,
      newPassword: 'changed-pass',
    },
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
  const listing = {
    item_id: itemId,
    quantity: 6,
    unit_price: 100,
    request_key: randomUUID(),
  };
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
      {
        item_id: itemId,
        quantity: 1,
        unit_price: 20,
        request_key: randomUUID(),
      },
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

test('복구 코드 해시, 일회성 비밀번호 복구, 재발급, 정보 내보내기와 세션 종료', async () => {
  const body = account('복구 검사');
  const signup = await call('auth/signup', 'POST', body);
  const code = signup.data.recoveryCode;
  assert.match(code, /^[a-f0-9]{8}(?:-[a-f0-9]{8}){5}$/);
  const [[row]] = await db.execute('SELECT recovery_code_hash FROM users WHERE user_id=?', [
    signup.data.user.user_id,
  ]);
  assert.equal(row.recovery_code_hash.length, 64);
  assert.notEqual(row.recovery_code_hash, code.replaceAll('-', ''));
  assert.equal(
    (
      await call('auth/reset-password', 'POST', {
        email: body.email,
        recoveryCode: 'wrong',
        newPassword: 'new-pass20510',
      })
    ).status,
    403,
  );
  const reset = await call('auth/reset-password', 'POST', {
    email: body.email,
    recoveryCode: code,
    newPassword: 'new-pass20510',
  });
  assert.equal(reset.status, 200);
  assert.notEqual(reset.data.recoveryCode, code);
  assert.equal((await call('auth/me', 'GET', null, signup.cookie)).data.user, null);
  assert.equal((await call('auth/login', 'POST', body)).status, 401);
  assert.equal(
    (
      await call('auth/reset-password', 'POST', {
        email: body.email,
        recoveryCode: code,
        newPassword: 'reuse-pass20510',
      })
    ).status,
    403,
  );
  const login = await call('auth/login', 'POST', {
    ...body,
    password: 'new-pass20510',
  });
  assert.equal(login.status, 200);
  assert.equal(
    (await call('auth/recovery-code', 'POST', { currentPassword: pw }, login.cookie)).status,
    403,
  );
  const renewed = await call(
    'auth/recovery-code',
    'POST',
    { currentPassword: 'new-pass20510' },
    login.cookie,
  );
  assert.equal(renewed.status, 200);
  assert.notEqual(renewed.data.recoveryCode, reset.data.recoveryCode);
  assert.equal(
    (
      await call('auth/reset-password', 'POST', {
        email: body.email,
        recoveryCode: reset.data.recoveryCode,
        newPassword: 'other-pass20510',
      })
    ).status,
    403,
  );
  assert.equal((await call('auth/export')).status, 401);
  const data = await call('auth/export', 'GET', null, login.cookie);
  assert.equal(data.data.profile.email, body.email);
  assert.ok(!JSON.stringify(data.data).includes('password_hash'));
  assert.ok(!JSON.stringify(data.data).includes('recovery_code_hash'));
  assert.equal(
    (
      await call(
        'auth/me',
        'DELETE',
        { currentPassword: 'new-pass20510', confirm: true },
        login.cookie,
      )
    ).status,
    204,
  );
  const [[withdrawn]] = await db.execute(
    'SELECT email,password_hash,recovery_code_hash FROM users WHERE user_id=?',
    [signup.data.user.user_id],
  );
  assert.deepEqual(
    { ...withdrawn },
    { email: null, password_hash: null, recovery_code_hash: null },
  );
});

test('서로 다른 두 테이블 JOIN 결과와 원본 0개 회원의 통계 및 공개 정보 범위', async () => {
  const a = await call('auth/signup', 'POST', account('통계 제작자'));
  const b = await call('auth/signup', 'POST', account('통계 빈 창고'));
  const ids = [];
  for (let index = 0; index < 2; index++) {
    const created = await call(
      'items',
      'POST',
      {
        name: '통계 ' + randomUUID(),
        category: '장식',
        description: '집계 확인',
        image_url: '',
      },
      a.cookie,
    );
    ids.push(created.data.item_id);
  }
  await call(
    'production',
    'POST',
    { item_id: ids[0], quantity: 7, request_key: randomUUID() },
    a.cookie,
  );
  const catalog = (await call('items?creator=' + a.data.user.user_id)).data;
  assert.equal(catalog.length, 2);
  assert.ok(catalog.every((item) => item.nickname === '통계 제작자'));
  const result = (await call('reports/creator-stats')).data;
  const maker = result.find((row) => row.user_id === a.data.user.user_id);
  const empty = result.find((row) => row.user_id === b.data.user.user_id);
  assert.equal(maker.item_count, 2);
  assert.equal(maker.total_produced, '7');
  assert.equal(empty.item_count, 0);
  assert.equal(empty.total_produced, '0');
  for (const row of result) {
    assert.ok(!('email' in row));
    assert.ok(!('password_hash' in row));
    assert.ok(!('gold_balance' in row));
  }
  await call('items/' + ids[1], 'DELETE', null, a.cookie);
  assert.equal(
    (await call('reports/creator-stats')).data.find((row) => row.user_id === a.data.user.user_id)
      .item_count,
    1,
  );
  for (const u of [a, b])
    await call('auth/me', 'DELETE', { currentPassword: pw, confirm: true }, u.cookie);
});

test('구매와 판매 취소 동시 요청, 반복 취소, 생산량과 보유량 및 예약량 일치', async () => {
  const a = await call('auth/signup', 'POST', account('동시성 판매자'));
  const b = await call('auth/signup', 'POST', account('동시성 구매자'));
  const item = await call(
    'items',
    'POST',
    {
      name: '경합 ' + randomUUID(),
      category: '기타',
      description: '구매 취소 경합',
      image_url: '',
    },
    a.cookie,
  );
  const itemId = item.data.item_id;
  await call(
    'production',
    'POST',
    { item_id: itemId, quantity: 2, request_key: randomUUID() },
    a.cookie,
  );
  const sale = await call(
    'market',
    'POST',
    {
      item_id: itemId,
      quantity: 2,
      unit_price: 100,
      request_key: randomUUID(),
    },
    a.cookie,
  );
  const listingId = sale.data.listing_id;
  const [buy, cancel] = await Promise.all([
    call(
      'market/' + listingId + '/buy',
      'POST',
      { quantity: 1, request_key: randomUUID() },
      b.cookie,
    ),
    call('market/' + listingId, 'DELETE', null, a.cookie),
  ]);
  assert.ok([200, 409].includes(buy.status));
  assert.equal(cancel.status, 200);
  assert.equal((await call('market/' + listingId, 'DELETE', null, a.cookie)).status, 200);
  const [stocks] = await db.execute(
    'SELECT user_id,quantity,reserved_quantity FROM inventories WHERE item_id=?',
    [itemId],
  );
  assert.equal(
    stocks.reduce((sum, stock) => sum + stock.quantity, 0),
    2,
  );
  assert.equal(
    stocks.reduce((sum, stock) => sum + stock.reserved_quantity, 0),
    0,
  );
  const [[production]] = await db.execute(
    'SELECT SUM(quantity) AS total FROM production_logs WHERE item_id=?',
    [itemId],
  );
  assert.equal(Number(production.total), 2);
  const [balances] = await db.execute('SELECT gold_balance FROM users WHERE user_id IN (?,?)', [
    a.data.user.user_id,
    b.data.user.user_id,
  ]);
  assert.equal(
    balances.reduce((sum, user) => sum + user.gold_balance, 0),
    2000,
  );
  for (const u of [a, b])
    await call('auth/me', 'DELETE', { currentPassword: pw, confirm: true }, u.cookie);
});

test('기본 보안 헤더, 교차 사이트 변경 차단, 잘못된 JSON 및 비공개 파일 차단', async () => {
  const health = await fetch(base + 'health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(health.headers.get('x-frame-options'), 'DENY');
  assert.equal((await call('does-not-exist')).status, 404);
  assert.equal(
    (
      await fetch(base + 'auth/logout', {
        method: 'POST',
        headers: { Origin: 'https://other.example' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + 'auth/logout', {
        method: 'POST',
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + 'auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + 'auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '[]',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + 'auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a'.repeat(40000) }),
      })
    ).status,
    413,
  );
  for (const file of ['.env', '.local/admin-password', '.npm-cache'])
    assert.equal((await fetch(base.replace('/api/', '/') + file)).status, 404);
});

test('반복 인증 요청은 429와 대기 시간으로 제한', async () => {
  let limited;
  for (let attempt = 0; attempt < 31; attempt++) {
    const response = await fetch(base + 'auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid', password: 'invalid' }),
    });
    if (response.status === 429) {
      limited = response;
      break;
    }
    assert.equal(response.status, 400);
  }
  assert.ok(limited);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('24678 포트가 사용 중이어도 두 개발 서버의 HTTP와 WebSocket이 각 포트에서 동작', async () => {
  const blocker = createHttpServer();
  try {
    await new Promise((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(24678, '127.0.0.1', resolve);
    });
  } catch (error) {
    // 다른 앱이 이미 점유한 경우에도 같은 충돌 조건이다. 그 앱은 종료하지 않는다.
    if (error.code !== 'EADDRINUSE') throw error;
  }
  const runs = [];
  try {
    for (let index = 0; index < 2; index++) {
      const run = launchProcess(true, 0);
      runs.push(run);
      const url = await readyUrl(run);
      assert.equal((await fetch(url + '/api/health')).status, 200);
      const html = await fetch(url);
      assert.equal(html.status, 200);
      assert.match(await html.text(), /choriClass/);
      assert.equal((await fetch(url + '/@vite/client')).status, 200);
      const socket = new WebSocket(url.replace('http:', 'ws:') + '/', 'vite-hmr');
      try {
        const message = await within(
          new Promise((resolve, reject) => {
            socket.addEventListener('message', (event) => resolve(JSON.parse(event.data)), {
              once: true,
            });
            socket.addEventListener(
              'error',
              () => reject(new Error('개발용 WebSocket 연결 실패')),
              { once: true },
            );
          }),
        );
        assert.equal(message.type, 'connected');
      } finally {
        socket.close();
      }
      assert.doesNotMatch(run.output(), /WebSocket server error|TypeError/);
    }
  } finally {
    for (const run of runs) await stopProcess(run);
    if (blocker.listening) await new Promise((resolve) => blocker.close(resolve));
  }
});

test('같은 게임을 다시 실행하면 기존 주소를 알려주고 정상 종료', async () => {
  const occupiedPort = Number(new URL(base).port);
  for (const dev of [false, true]) {
    const run = launchProcess(dev, occupiedPort);
    try {
      assert.equal(await within(run.ended), 0);
      assert.match(run.output(), /choriClass가 이미 실행 중/);
      assert.ok(run.output().includes('http://127.0.0.1:' + occupiedPort));
      assert.doesNotMatch(run.output(), /TypeError|Cannot read properties|WebSocket server error/);
      assert.doesNotMatch(run.output(), /choriClass http:/);
      assert.equal((await fetch(base + 'health')).status, 200);
    } finally {
      await stopProcess(run);
    }
  }
});

test('다른 프로그램이 포트를 사용 중이면 덮어쓰지 않고 충돌을 안내한 뒤 종료', async () => {
  const other = createHttpServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
  });
  await new Promise((resolve, reject) => {
    other.once('error', reject);
    other.listen(0, '127.0.0.1', resolve);
  });
  const otherPort = other.address().port;
  try {
    for (const dev of [false, true]) {
      const run = launchProcess(dev, otherPort);
      try {
        assert.equal(await within(run.ended), 1);
        assert.match(run.output(), new RegExp(otherPort + '번 포트를 이미 사용 중'));
        assert.doesNotMatch(
          run.output(),
          /TypeError|Cannot read properties|WebSocket server error/,
        );
        assert.doesNotMatch(run.output(), /choriClass가 이미 실행 중/);
        assert.equal((await fetch('http://127.0.0.1:' + otherPort)).status, 200);
      } finally {
        await stopProcess(run);
      }
    }
  } finally {
    await new Promise((resolve) => other.close(resolve));
  }
});
