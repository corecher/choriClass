import React, { useState } from 'react';
import { Store, Tag } from 'lucide-react';
import { Alert, Art, Empty, Head, Load, api, go, money, useAction, useData } from './common.jsx';

function Stock({ item, refresh }) {
  const action = useAction();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [notice, setNotice] = useState('');
  function sell(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    action.run(async () => {
      await api('market', 'POST', {
        item_id: item.item_id,
        quantity: Number(body.quantity),
        unit_price: Number(body.price),
        request_key: key,
      });
      setKey(crypto.randomUUID());
      refresh();
      go('sales');
    });
  }
  return (
    <article className="panel stock">
      <div className="stock-head">
        <Art item={item} />
        <div>
          <a href={'#/item/' + item.item_id}>
            <h2>{item.name}</h2>
          </a>
          <p>
            {item.nickname} 제작 · {item.status === 'ACTIVE' ? '제작 가능' : '제작 종료'}
          </p>
        </div>
      </div>
      <div className="quantities">
        <span>
          보유 <b>{item.quantity}</b>
        </span>
        <span>
          판매 예약 <b>{item.reserved_quantity}</b>
        </span>
        <span>
          판매 가능 <b>{item.available}</b>
        </span>
      </div>
      <form className="inline-form" onSubmit={sell} onChange={() => setKey(crypto.randomUUID())}>
        <label>
          판매 수량
          <input
            name="quantity"
            type="number"
            min="1"
            max={item.available}
            defaultValue="1"
            required
          />
        </label>
        <label>
          개당 가격 (G)
          <input name="price" type="number" min="1" defaultValue="100" required />
        </label>
        <button className="primary" disabled={!item.available || action.busy}>
          <Tag size={16} /> 판매 등록
        </button>
      </form>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const memo = new FormData(e.currentTarget).get('memo');
          action.run(async () => {
            await api('inventory/' + item.item_id, 'PATCH', { memo });
            setNotice('개인 메모를 저장했습니다.');
          });
        }}
      >
        <label>
          개인 메모
          <input
            name="memo"
            maxLength="300"
            defaultValue={item.memo || ''}
            placeholder="나만 볼 수 있는 메모"
          />
        </label>
        <button disabled={action.busy}>메모 저장</button>
      </form>
      <Alert message={action.error} />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
    </article>
  );
}
export function Inventory({ revision, refresh }) {
  const state = useData('inventory', revision);
  return (
    <main className="content">
      <Head label="MY INVENTORY" title="내 인벤토리">
        생산하거나 구매한 아이템의 수량을 확인하고 판매할 수 있어요.
      </Head>
      <Load state={state}>
        {(rows) =>
          rows.length ? (
            <div className="stock-grid">
              {rows.map((i) => (
                <Stock key={i.item_id} item={i} refresh={refresh} />
              ))}
            </div>
          ) : (
            <Empty title="아직 보유한 아이템이 없어요">
              <a href="#/studio">제작소로 이동 →</a>
            </Empty>
          )
        }
      </Load>
    </main>
  );
}
export function Market({ user, page, listingId, revision, refresh, onUser }) {
  const own = page === 'sales',
    buying = page === 'buy';
  const [sort, setSort] = useState('new');
  const state = useData(own ? 'my-listings' : 'market?sort=' + sort, revision);
  const action = useAction();
  const [quantity, setQuantity] = useState('1');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const title = own ? '내 판매 관리' : buying ? '구매 확인' : '아이템 시장';
  return (
    <main className={'content' + (buying ? ' narrow' : '')}>
      <Head label={own ? 'MY LISTINGS' : buying ? 'CHECKOUT' : 'ITEM MARKET'} title={title}>
        {own
          ? '등록한 매물의 남은 수량과 판매 상태를 확인하세요.'
          : buying
            ? '구매할 수량과 결제 후 잔액을 확인하세요.'
            : '수집가들이 판매 중인 아이템을 둘러보세요.'}
      </Head>
      {!buying && (
        <div className="toolbar">
          <a className={'btn ' + (!own ? 'selected' : '')} href="#/market">
            전체 매물
          </a>
          {user && (
            <a className={'btn ' + (own ? 'selected' : '')} href="#/sales">
              내 판매 관리
            </a>
          )}
          {!own && (
            <select aria-label="매물 정렬" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="new">최신순</option>
              <option value="price">낮은 가격순</option>
            </select>
          )}
        </div>
      )}
      <Alert message={action.error} />
      <Load state={state}>
        {(rows) => {
          if (buying) {
            const listing = rows.find((l) => l.listing_id === Number(listingId));
            if (!listing)
              return (
                <Empty title="판매가 종료된 매물입니다">
                  <a href="#/market">시장으로 돌아가기 →</a>
                </Empty>
              );
            const total = Number(quantity) * listing.unit_price;
            return (
              <form
                className="panel stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  action.run(async () => {
                    if (!user) {
                      go('login');
                      return;
                    }
                    await api('market/' + listingId + '/buy', 'POST', {
                      quantity: Number(quantity),
                      request_key: key,
                    });
                    refresh();
                    go('trades');
                    const me = await api('auth/me');
                    onUser(me.user);
                  });
                }}
              >
                <div className="stock-head">
                  <Art item={listing} />
                  <div>
                    <h2>{listing.name}</h2>
                    <span>
                      판매자 {listing.seller} · 남은 {listing.remaining_quantity}개
                    </span>
                  </div>
                </div>
                <label>
                  구매 수량
                  <input
                    type="number"
                    min="1"
                    max={listing.remaining_quantity}
                    value={quantity}
                    required
                    onChange={(e) => {
                      setQuantity(e.target.value);
                      setKey(crypto.randomUUID());
                    }}
                  />
                </label>
                <dl className="receipt">
                  <div>
                    <dt>개당 가격</dt>
                    <dd>{money(listing.unit_price)}</dd>
                  </div>
                  <div>
                    <dt>결제 금액</dt>
                    <dd>{money(total)}</dd>
                  </div>
                  {user && (
                    <>
                      <div>
                        <dt>보유 골드</dt>
                        <dd>{money(user.gold_balance)}</dd>
                      </div>
                      <div>
                        <dt>구매 후 잔액</dt>
                        <dd>{money(user.gold_balance - total)}</dd>
                      </div>
                    </>
                  )}
                </dl>
                {user && user.gold_balance < total && (
                  <p className="alert">구매할 골드가 부족합니다.</p>
                )}
                <button
                  className="primary"
                  disabled={
                    action.busy ||
                    (user && (listing.seller_id === user.user_id || user.gold_balance < total))
                  }
                >
                  {user ? '구매 확정' : '로그인하고 구매하기'}
                </button>
                <a href="#/market">시장으로 돌아가기</a>
              </form>
            );
          }
          if (!rows.length)
            return (
              <Empty title={own ? '등록한 매물이 없어요' : '판매 중인 매물이 없어요'}>
                {user ? (
                  <a href="#/inventory">내 인벤토리로 이동 →</a>
                ) : (
                  '수집가가 매물을 등록하면 여기에 표시됩니다.'
                )}
              </Empty>
            );
          return (
            <div className="tiles">
              {rows.map((l) => (
                <article className="tile" key={l.listing_id}>
                  <a href={'#/item/' + l.item_id} className="tile-art">
                    <Art item={l} />
                  </a>
                  <div className="tile-copy">
                    <span className="pill">
                      {{ ACTIVE: '판매 중', SOLD_OUT: '품절', CANCELED: '취소' }[l.status]}
                    </span>
                    {l.item_status === 'RETIRED' && <span className="pill">제작 종료</span>}
                    <h3>{l.name}</h3>
                    <p>
                      최초 제작자 {l.creator} · 판매자 {l.seller}
                    </p>
                    <p>
                      개당 <b>{money(l.unit_price)}</b> · 남은 {l.remaining_quantity}개
                    </p>
                    {l.status === 'ACTIVE' &&
                      (l.seller_id === user?.user_id ? (
                        <button
                          disabled={action.busy}
                          onClick={() =>
                            action.run(async () => {
                              if (!window.confirm('미판매 수량의 예약을 취소할까요?')) return;
                              await api('market/' + l.listing_id, 'DELETE');
                              refresh();
                            })
                          }
                        >
                          매물 취소
                        </button>
                      ) : (
                        <a className="btn" href={user ? '#/buy/' + l.listing_id : '#/login'}>
                          <Store size={15} />
                          {user ? '구매하기' : '로그인하고 구매'}
                        </a>
                      ))}
                  </div>
                </article>
              ))}
            </div>
          );
        }}
      </Load>
    </main>
  );
}
export function Trades({ user, revision }) {
  const state = useData('trades', revision);
  return (
    <main className="content">
      <Head label="TRADE JOURNAL" title="거래 내역">
        내가 구매하거나 판매한 거래만 표시됩니다.
      </Head>
      <Load state={state}>
        {(rows) =>
          rows.length ? (
            <section className="panel">
              {rows.map((t) => (
                <div className="history-row" key={t.trade_id}>
                  <div>
                    <span className="pill">{t.buyer_id === user.user_id ? '구매' : '판매'}</span>{' '}
                    <b>{t.item_name_snapshot}</b>
                    <p>
                      {t.seller} → {t.buyer} · {t.created_at}
                    </p>
                  </div>
                  <div>
                    {t.quantity}개 × {money(t.unit_price)}
                    <br />
                    <b>합계 {money(t.total_price)}</b>
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <Empty title="아직 완료된 거래가 없어요">
              <a href="#/market">시장 둘러보기 →</a>
            </Empty>
          )
        }
      </Load>
    </main>
  );
}
