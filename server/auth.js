import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { pool, transaction } from './db.js';
import { emailAddress, fail, field, password } from './validation.js';
import { rateLimit } from './rate-limit.js';

export const accounts = Router();
const profile = 'u.user_id, u.email, u.nickname, u.bio, u.gold_balance, u.created_at';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
  secure: process.env.COOKIE_SECURE === 'true',
};
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
function recoveryCode() {
  // 복구 코드는 추측하기 어려운 난수다. DB에는 원문 대신 SHA-256 해시만 보관한다.
  const raw = randomBytes(24).toString('hex');
  return { text: raw.match(/.{8}/g).join('-'), hash: digest(raw) };
}
function cookieToken(req) {
  return (req.headers.cookie || '').match(/(?:^|;\s*)chori_session=([0-9a-f]{64})(?:;|$)/)?.[1];
}
export async function currentUser(db, req) {
  const token = cookieToken(req);
  if (!token) return null;
  // 쿠키 원문 대신 해시를 찾는다. 탈퇴 회원이나 만료된 로그인은 매 요청마다 제외한다.
  const [rows] = await db.execute(
    'SELECT ' +
      profile +
      ' FROM sessions s JOIN users u ON u.user_id=s.user_id WHERE s.token_hash=? AND s.expires_at>NOW() AND u.status="ACTIVE"',
    [digest(token)],
  );
  return rows[0] || null;
}
export async function requireUser(db, req) {
  const user = await currentUser(db, req);
  if (!user) fail(401, '로그인 후 이용해 주세요.');
  return user;
}
async function newSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  await db.execute(
    'INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 7 DAY))',
    [digest(token), userId],
  );
  return token;
}
function sendSession(res, token) {
  res.cookie('chori_session', token, {
    ...cookieOptions,
    maxAge: 7 * 86400000,
  });
}

accounts.get('/me', async (req, res) => res.json({ user: await currentUser(pool, req) }));
accounts.post('/signup', rateLimit(), async (req, res) => {
  const email = emailAddress(req.body.email);
  const nickname = field(req.body.nickname, '닉네임', 30);
  const plain = password(req.body.password);
  // await는 해시 생성이 끝날 때까지 기다린다. 평문 비밀번호를 DB에 저장하지 않는다.
  const hash = await bcrypt.hash(plain, 12);
  const recovery = recoveryCode();
  try {
    const result = await transaction(async (db) => {
      // 물음표에는 검증한 값만 별도로 전달한다. 이 INSERT 한 번으로 계정과 기본 골드가 함께 생성된다.
      const [saved] = await db.execute(
        'INSERT INTO users (email,nickname,password_hash,recovery_code_hash) VALUES (?,?,?,?)',
        [email, nickname, hash, recovery.hash],
      );
      const token = await newSession(db, saved.insertId);
      const [rows] = await db.execute('SELECT ' + profile + ' FROM users u WHERE user_id=?', [
        saved.insertId,
      ]);
      return { token, user: rows[0] };
    });
    sendSession(res, result.token);
    res.status(201).json({ user: result.user, recoveryCode: recovery.text });
  } catch (error) {
    // 동시에 같은 이메일로 가입해도 DB의 UNIQUE 조건을 통과한 한 계정만 생성된다.
    if (error.code === 'ER_DUP_ENTRY') fail(409, '이미 가입한 이메일입니다. 로그인해 주세요.');
    throw error;
  }
});

accounts.post('/login', rateLimit(), async (req, res) => {
  const email = emailAddress(req.body.email);
  const plain = req.body.password;
  if (typeof plain !== 'string' || !plain || Buffer.byteLength(plain) > 72)
    fail(401, '이메일 또는 비밀번호를 확인해 주세요.');
  const result = await transaction(async (db) => {
    const [rows] = await db.execute(
      'SELECT ' +
        profile +
        ', u.password_hash FROM users u WHERE email=? AND status="ACTIVE" FOR UPDATE',
      [email],
    );
    const user = rows[0];
    // 로그인은 평문을 복원하지 않고 bcrypt.compare로 가입 시 저장한 해시와 비교한다.
    if (!user || !(await bcrypt.compare(plain, user.password_hash)))
      fail(401, '이메일 또는 비밀번호를 확인해 주세요.');
    delete user.password_hash;
    return { user, token: await newSession(db, user.user_id) };
  });
  sendSession(res, result.token);
  res.json({ user: result.user });
});
accounts.post('/reset-password', rateLimit({ limit: 10 }), async (req, res) => {
  const email = emailAddress(req.body.email);
  const next = password(req.body.newPassword);
  const code = String(req.body.recoveryCode || '')
    .trim()
    .replaceAll('-', '')
    .toLowerCase();
  if (!/^[a-f0-9]{48}$/.test(code)) fail(403, '이메일 또는 복구 코드를 확인해 주세요.');
  const recovery = recoveryCode();
  await transaction(async (db) => {
    const [rows] = await db.execute(
      'SELECT user_id FROM users WHERE email=? AND recovery_code_hash=? AND status="ACTIVE" FOR UPDATE',
      [email, digest(code)],
    );
    if (!rows.length) fail(403, '이메일 또는 복구 코드를 확인해 주세요.');
    // 복구에 성공한 코드는 즉시 교체하고 기존 모든 로그인을 종료한다.
    await db.execute('UPDATE users SET password_hash=?,recovery_code_hash=? WHERE user_id=?', [
      await bcrypt.hash(next, 12),
      recovery.hash,
      rows[0].user_id,
    ]);
    await db.execute('DELETE FROM sessions WHERE user_id=?', [rows[0].user_id]);
  }, true);
  res.clearCookie('chori_session', cookieOptions).json({ recoveryCode: recovery.text });
});
accounts.post('/recovery-code', rateLimit({ limit: 10 }), async (req, res) => {
  const recovery = recoveryCode();
  await transaction(async (db) => {
    const user = await requireUser(db, req);
    await checkPassword(db, user.user_id, req.body.currentPassword);
    await db.execute('UPDATE users SET recovery_code_hash=? WHERE user_id=?', [
      recovery.hash,
      user.user_id,
    ]);
  }, true);
  res.json({ recoveryCode: recovery.text });
});
accounts.get('/export', async (req, res) => {
  const data = await transaction(async (db) => {
    const user = await requireUser(db, req);
    // 각 ?에는 서버가 확인한 본인 번호를 넣는다. 비밀번호 해시와 세션은 내보내지 않는다.
    const [originals] = await db.execute(
      'SELECT item_id,name,category,description,total_produced,status FROM items WHERE creator_id=?',
      [user.user_id],
    );
    const [inventory] = await db.execute(
      'SELECT v.item_id,i.name,v.quantity,v.reserved_quantity,v.memo FROM inventories v JOIN items i ON i.item_id=v.item_id WHERE v.user_id=?',
      [user.user_id],
    );
    const [trades] = await db.execute(
      'SELECT trade_id,item_name_snapshot,buyer_id,seller_id,quantity,unit_price,total_price,created_at FROM trades WHERE buyer_id=? OR seller_id=?',
      [user.user_id, user.user_id],
    );
    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      originals,
      inventory,
      trades,
    };
  });
  res.json(data);
});
accounts.post('/logout', async (req, res) => {
  const token = cookieToken(req);
  if (token) await pool.execute('DELETE FROM sessions WHERE token_hash=?', [digest(token)]);
  res.clearCookie('chori_session', cookieOptions).sendStatus(204);
});
accounts.patch('/me', async (req, res) => {
  const result = await transaction(async (db) => {
    const user = await requireUser(db, req);
    const nickname = field(req.body.nickname, '닉네임', 30);
    const bio = field(req.body.bio, '소개', 300, false);
    let token;
    if (req.body.newPassword) {
      const next = password(req.body.newPassword);
      await checkPassword(db, user.user_id, req.body.currentPassword);
      await db.execute('UPDATE users SET password_hash=? WHERE user_id=?', [
        await bcrypt.hash(next, 12),
        user.user_id,
      ]);
      await db.execute('DELETE FROM sessions WHERE user_id=?', [user.user_id]);
      token = await newSession(db, user.user_id);
    }
    await db.execute('UPDATE users SET nickname=?,bio=? WHERE user_id=?', [
      nickname,
      bio,
      user.user_id,
    ]);
    return { token, user: { ...user, nickname, bio } };
  }, true);
  if (result.token) sendSession(res, result.token);
  res.json({ user: result.user });
});

async function checkPassword(db, userId, plain) {
  const [rows] = await db.execute('SELECT password_hash FROM users WHERE user_id=? FOR UPDATE', [
    userId,
  ]);
  if (
    typeof plain !== 'string' ||
    Buffer.byteLength(plain) > 72 ||
    !(await bcrypt.compare(plain, rows[0].password_hash))
  )
    fail(403, '현재 비밀번호가 일치하지 않습니다.');
}
accounts.delete('/me', async (req, res) => {
  await transaction(async (db) => {
    const user = await requireUser(db, req);
    await checkPassword(db, user.user_id, req.body.currentPassword);
    if (req.body.confirm !== true) fail(400, '탈퇴 의사를 확인해 주세요.');
    // 탈퇴 중에는 거래를 잠근다. 본인 매물만 취소하고 다른 사람의 보유 수량과 구입 이력은 유지한다.
    await db.execute(
      'UPDATE listings SET status="CANCELED" WHERE seller_id=? AND status="ACTIVE"',
      [user.user_id],
    );
    await db.execute('UPDATE inventories SET reserved_quantity=0 WHERE user_id=?', [user.user_id]);
    await db.execute(
      'UPDATE items SET status="RETIRED",deleted_at=NOW() WHERE creator_id=? AND status="ACTIVE"',
      [user.user_id],
    );
    await db.execute(
      'UPDATE users SET status="WITHDRAWN", email=NULL, password_hash=NULL, recovery_code_hash=NULL, bio="", nickname="탈퇴 회원", deleted_at=NOW() WHERE user_id=?',
      [user.user_id],
    );
    await db.execute('DELETE FROM sessions WHERE user_id=?', [user.user_id]);
  }, true);
  res.clearCookie('chori_session', cookieOptions).sendStatus(204);
});
