import bcrypt from 'bcryptjs';
import { initialize, pool, transaction } from '../server/db.js';

// 선택 실행하는 시연 데이터다. 앱을 시작할 때 자동으로 추가하지 않으며, 반복 실행해도 중복 생산하지 않는다.
const password = 'Demo20510!';
const examples = [
  {
    name: '별빛 리본',
    category: '장식',
    description: '밤하늘의 작은 별을 엮은 리본. 수집가의 첫 소장품입니다.',
  },
  {
    name: '라벤더 망토',
    category: '의상',
    description: '보랏빛 실로 짠 가벼운 여행 망토입니다.',
  },
  {
    name: '달의 결정',
    category: '수집품',
    description: '달빛이 모여 만들어진 반투명 결정입니다.',
  },
  {
    name: '구름 검',
    category: '장비',
    description: '구름처럼 가벼운 장식용 검입니다.',
  },
];
try {
  await initialize();
  await transaction(async (db) => {
    const users = [];
    for (const [email, nickname, bio] of [
      ['maker@chori.example', '별빛 제작자', '작은 반짝임을 원본으로 기록합니다.'],
      ['collector@chori.example', '구름 수집가', '좋아하는 아이템을 모으는 수집가입니다.'],
    ]) {
      const [found] = await db.execute(
        'SELECT user_id,password_hash,status FROM users WHERE email=?',
        [email],
      );
      if (found.length) {
        if (
          found[0].status !== 'ACTIVE' ||
          !(await bcrypt.compare(password, found[0].password_hash))
        )
          throw new Error('동일 이메일의 기존 계정이 있어 시연 데이터를 추가하지 않았습니다.');
        users.push(found[0].user_id);
      } else {
        const [created] = await db.execute(
          'INSERT INTO users (email,nickname,bio,password_hash) VALUES (?,?,?,?)',
          [email, nickname, bio, await bcrypt.hash(password, 12)],
        );
        users.push(created.insertId);
      }
    }
    for (let index = 0; index < examples.length; index++) {
      const item = examples[index];
      const key = item.name.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
      const [found] = await db.execute(
        'SELECT item_id,creator_id,status FROM items WHERE name_key=?',
        [key],
      );
      let itemId;
      if (found.length) {
        if (found[0].creator_id !== users[0] || found[0].status !== 'ACTIVE') continue;
        itemId = found[0].item_id;
      } else {
        const [created] = await db.execute(
          'INSERT INTO items (creator_id,name,name_key,category,description) VALUES (?,?,?,?,?)',
          [users[0], item.name, key, item.category, item.description],
        );
        itemId = created.insertId;
      }
      const request = '20510000-0000-4000-8000-' + String(index + 1).padStart(12, '0');
      const [past] = await db.execute(
        'SELECT production_id FROM production_logs WHERE producer_id=? AND request_key=?',
        [users[0], request],
      );
      if (!past.length) {
        await db.execute(
          'UPDATE items SET total_produced=total_produced+10,first_produced_at=COALESCE(first_produced_at,NOW()) WHERE item_id=?',
          [itemId],
        );
        await db.execute(
          'INSERT INTO inventories (user_id,item_id,quantity) VALUES (?,?,10) ON DUPLICATE KEY UPDATE quantity=quantity+10',
          [users[0], itemId],
        );
        await db.execute(
          'INSERT INTO production_logs (item_id,producer_id,quantity,request_key) VALUES (?,?,10,?)',
          [itemId, users[0], request],
        );
        await db.execute(
          'UPDATE inventories SET reserved_quantity=reserved_quantity+4 WHERE user_id=? AND item_id=?',
          [users[0], itemId],
        );
        await db.execute(
          'INSERT INTO listings (item_id,seller_id,unit_price,initial_quantity,remaining_quantity,request_key) VALUES (?,?,100,4,4,?)',
          [itemId, users[0], request],
        );
      }
    }
  }, true);
  console.log(
    '시연 데이터 준비 완료.\n제작자: maker@chori.example\n수집가: collector@chori.example\n시연 계정 비밀번호: ' +
      password,
  );
} catch (error) {
  console.error('시연 데이터 준비 실패:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
