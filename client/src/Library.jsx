import React, { useState } from 'react';
import { ArrowRight, Hammer, Plus, Search, Pencil, Trash2, Layers3 } from 'lucide-react';
import {
  Alert,
  Art,
  categories,
  Empty,
  Head,
  Load,
  api,
  go,
  money,
  useAction,
  useData,
} from './common.jsx';

function Tile({ item }) {
  return (
    <a className="tile" href={'#/item/' + item.item_id}>
      <div className="tile-art">
        <Art item={item} />
        <small>NO. {String(item.item_id).padStart(3, '0')}</small>
      </div>
      <div className="tile-copy">
        <span className="pill">{item.category}</span>
        <h3>{item.name}</h3>
        <p>
          {item.nickname} · 누적 {item.total_produced.toLocaleString()}개
        </p>
      </div>
    </a>
  );
}
export function Library({ page, user, revision }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [creator, setCreator] = useState('');
  const studio = page === 'studio',
    creators = page === 'creators';
  const all = useData('items', revision);
  const filtered = useData(
    creators && creator ? 'items?creator=' + encodeURIComponent(creator) : null,
    revision,
  );
  const history = useData(studio ? 'production' : null, revision);
  return (
    <main className="content">
      <Head
        label={studio ? 'MY WORKSHOP' : creators ? 'CREATOR INDEX' : 'ITEM ARCHIVE'}
        title={studio ? '내 제작소' : creators ? '제작자별 도감' : '전체 아이템 도감'}
      >
        {studio
          ? '내가 만든 원본을 관리하고 원하는 수량만큼 생산하세요.'
          : creators
            ? '제작자의 공개 소개와 직접 만든 원본을 함께 살펴보세요.'
            : '수집가들이 만든 아이템 원본을 찾아보세요.'}
      </Head>
      <div className="toolbar">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="아이템 이름 검색"
            placeholder="아이템 이름 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select aria-label="분류" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">모든 분류</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {creators && (
          <select aria-label="제작자" value={creator} onChange={(e) => setCreator(e.target.value)}>
            <option value="">모든 제작자</option>
            {[...new Map((all.data || []).map((i) => [i.creator_id, i])).values()].map((i) => (
              <option key={i.creator_id} value={i.creator_id}>
                {i.nickname} (#{i.creator_id})
              </option>
            ))}
          </select>
        )}
        {studio && (
          <a className="btn primary" href="#/new">
            <Plus size={16} /> 원본 등록
          </a>
        )}
      </div>
      <Load state={creators && creator ? filtered : all}>
        {(rows) => {
          const list = rows.filter(
            (i) =>
              (!studio || i.creator_id === user?.user_id) &&
              (!category || i.category === category) &&
              i.name.toLowerCase().includes(query.trim().toLowerCase()),
          );
          if (!list.length)
            return (
              <Empty title={studio ? '아직 만든 원본이 없어요' : '조건에 맞는 아이템이 없어요'}>
                {studio ? (
                  <a href="#/new">첫 아이템 등록하기 →</a>
                ) : (
                  '다른 검색어나 분류로 찾아보세요.'
                )}
              </Empty>
            );
          if (creators) {
            const groups = Map.groupBy(list, (i) => i.creator_id);
            return Array.from(groups, ([key, group]) => (
              <section key={key} className="creator-group">
                <h2>{group[0].nickname}</h2>
                <p>{group[0].bio || '아직 공개 소개가 없습니다.'}</p>
                <div className="tiles">
                  {group.map((i) => (
                    <Tile key={i.item_id} item={i} />
                  ))}
                </div>
              </section>
            ));
          }
          return (
            <div className="tiles">
              {list.map((i) => (
                <Tile key={i.item_id} item={i} />
              ))}
            </div>
          );
        }}
      </Load>
      {studio && (
        <section className="history">
          <h2>
            <Hammer size={20} /> 생산 이력
          </h2>
          <Load state={history}>
            {(rows) =>
              rows.length ? (
                rows.map((p) => (
                  <div className="history-row" key={p.production_id}>
                    <b>{p.name}</b>
                    <span>
                      {p.quantity}개 생산 · {p.created_at}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">첫 생산을 완료하면 이곳에 기록됩니다.</p>
              )
            }
          </Load>
        </section>
      )}
    </main>
  );
}
export function Editor({ itemId, refresh }) {
  const state = useData(itemId ? 'items/' + itemId : 'auth/me');
  return (
    <main className="content narrow">
      <Head label="ORIGINAL RECORD" title={itemId ? '원본 수정' : '새 원본 등록'}>
        도감에 표시할 아이템의 정보를 입력하세요.
      </Head>
      <Load state={state}>
        {(data) => <EditForm item={itemId ? data : null} refresh={refresh} />}
      </Load>
    </main>
  );
}
function EditForm({ item, refresh }) {
  const action = useAction();
  const [url, setUrl] = useState(item?.image_url || '');
  async function submit(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    action.run(async () => {
      const path = 'items' + (item ? '/' + item.item_id : '');
      const data = await api(path, item ? 'PATCH' : 'POST', {
        ...body,
        category: body.category || item?.category,
        image_url: url,
      });
      refresh();
      go('item/' + (item?.item_id || data.item_id));
    });
  }
  return (
    <form className="panel stack" onSubmit={submit}>
      <label>
        아이템 이름
        <input name="name" required maxLength="100" defaultValue={item?.name} readOnly={!!item} />
      </label>
      <label>
        분류
        <select
          name="category"
          defaultValue={item?.category || ''}
          disabled={!!item?.first_produced_at}
          required
        >
          <option value="" disabled>
            분류 선택
          </option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        대표 이미지 주소 (선택)
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!!item?.first_produced_at}
          placeholder="https://"
        />
      </label>
      <div className="mini-preview">
        <Art item={{ image_url: url }} />
        <small>대표 이미지 미리보기</small>
      </div>
      <label>
        설명
        <textarea
          name="description"
          defaultValue={item?.description}
          required
          maxLength="2000"
          rows="4"
        />
      </label>
      <p className="muted">등록한 이름은 고정되며, 첫 생산 후에는 분류와 이미지도 고정됩니다.</p>
      <Alert message={action.error} />
      <button className="primary" disabled={action.busy}>
        {item ? '수정 저장' : '원본 등록'} <ArrowRight size={16} />
      </button>
      <a href={item ? '#/item/' + item.item_id : '#/studio'}>돌아가기</a>
    </form>
  );
}

export function Detail({ itemId, user, refresh, revision }) {
  const state = useData('items/' + itemId, revision);
  const market = useData('market', revision);
  const action = useAction();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [notice, setNotice] = useState('');
  return (
    <main className="content">
      <Load state={state}>
        {(item) => {
          const owned = item.creator_id === user?.user_id && item.status === 'ACTIVE';
          return (
            <>
              <Head
                label={'ARCHIVE OBJECT / NO. ' + String(item.item_id).padStart(3, '0')}
                title={item.name}
              >
                {item.nickname} 제작 · {item.category}
              </Head>
              <section className="detail panel">
                <div className="detail-art">
                  <Art item={item} />
                </div>
                <div>
                  <span className="pill">
                    {item.status === 'ACTIVE' ? '제작 가능' : '제작 종료'}
                  </span>
                  <h2>원본 설명</h2>
                  <p className="description">{item.description}</p>
                  <p>
                    <Layers3 size={16} /> 누적 생산 {item.total_produced.toLocaleString()}개
                  </p>
                  {owned && (
                    <div className="actions">
                      <a className="btn" href={'#/edit/' + item.item_id}>
                        <Pencil size={15} /> 수정
                      </a>
                      <button
                        disabled={action.busy}
                        onClick={() =>
                          action.run(async () => {
                            if (
                              !window.confirm(
                                '이 원본의 제작을 종료할까요? 도감에서 숨겨지며 같은 이름은 다시 등록할 수 없습니다.',
                              )
                            )
                              return;
                            await api('items/' + item.item_id, 'DELETE');
                            refresh();
                            go('studio');
                          })
                        }
                      >
                        <Trash2 size={15} /> 제작 종료
                      </button>
                    </div>
                  )}
                </div>
              </section>
              {owned && (
                <form
                  className="panel inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const quantity = Number(new FormData(e.currentTarget).get('quantity'));
                    action.run(async () => {
                      await api('production', 'POST', {
                        item_id: item.item_id,
                        quantity,
                        request_key: key,
                      });
                      setKey(crypto.randomUUID());
                      setNotice(quantity + '개를 생산해 인벤토리에 보관했습니다.');
                      refresh();
                    });
                  }}
                >
                  <label>
                    생산 수량
                    <input
                      type="number"
                      name="quantity"
                      min="1"
                      step="1"
                      defaultValue="1"
                      required
                      onChange={() => setKey(crypto.randomUUID())}
                    />
                  </label>
                  <button className="primary" disabled={action.busy}>
                    <Hammer size={16} /> 생산하기
                  </button>
                  <a href="#/inventory">내 인벤토리 →</a>
                </form>
              )}
              <Alert message={action.error} />
              {notice && (
                <p role="status" className="notice">
                  {notice}
                </p>
              )}
              <h2 className="subhead">시장 매물</h2>
              <Load state={market}>
                {(rows) => {
                  const sales = rows.filter((l) => l.item_id === item.item_id);
                  return sales.length ? (
                    sales.map((l) => (
                      <a className="history-row" key={l.listing_id} href={'#/buy/' + l.listing_id}>
                        <b>{l.seller}</b>
                        <span>
                          개당 {money(l.unit_price)} · 남은 {l.remaining_quantity}개 →
                        </span>
                      </a>
                    ))
                  ) : (
                    <p className="muted">현재 판매 중인 매물이 없습니다.</p>
                  );
                }}
              </Load>
            </>
          );
        }}
      </Load>
    </main>
  );
}
