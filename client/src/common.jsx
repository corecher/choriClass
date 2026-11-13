import React, { useEffect, useState, useRef } from 'react';
import { Archive, Box, Gem, Shirt, Sparkles, Swords } from 'lucide-react';

export const categories = ['장비', '의상', '장식', '수집품', '기타'];
export const money = (value) => Number(value).toLocaleString('ko-KR') + ' G';
export function go(path) {
  location.hash = '/' + path;
}
export function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, '');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const change = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return route;
}
export async function api(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch('/api/' + path, {
      method,
      credentials: 'same-origin',
      headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.');
  }
  if (response.status === 204) return;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !['auth/login', 'auth/signup'].includes(path))
      window.dispatchEvent(new Event('chori:session-expired'));
    throw new Error(result.message || '요청을 완료하지 못했습니다.');
  }
  return result;
}
export function useData(path, revision = 0) {
  const [state, setState] = useState({ data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ data: null, error: '' });
    if (!path) return;
    api(path)
      .then((data) => {
        if (active) setState({ data, error: '' });
      })
      .catch((e) => {
        if (active) setState({ data: null, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [path, revision, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(task) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error, setError };
}
export function Alert({ message }) {
  return message ? (
    <p role="alert" className="alert">
      {message}
    </p>
  ) : null;
}
export function Load({ state, children }) {
  if (state.error)
    return (
      <div className="load-error">
        <Alert message={state.error} />
        <button onClick={state.retry}>다시 불러오기</button>
      </div>
    );
  if (!state.data)
    return (
      <p role="status" className="muted">
        불러오는 중…
      </p>
    );
  return children(state.data);
}
export function Paged({ rows, children, pageSize = 12 }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  // 검색 결과가 달라지면 첫 페이지로 이동한다. 페이지를 눌러도 검색 조건은 유지된다.
  const signature = rows
    .map((row) => row.trade_id ?? row.listing_id ?? row.production_id ?? row.item_id ?? row.user_id)
    .join(',');
  useEffect(() => setPage(1), [signature]);
  return (
    <>
      <p className="result-count" role="status">
        총 {rows.length.toLocaleString()}개 · {current} / {pages}페이지
      </p>
      {children(rows.slice((current - 1) * pageSize, current * pageSize))}
      {pages > 1 && (
        <nav className="pagination" aria-label="결과 페이지">
          <button disabled={current === 1} onClick={() => setPage(current - 1)}>
            이전
          </button>
          <span aria-current="page">
            {current} / {pages}
          </span>
          <button disabled={current === pages} onClick={() => setPage(current + 1)}>
            다음
          </button>
        </nav>
      )}
    </>
  );
}
export function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function RecoveryCode({ code }) {
  return (
    <section className="recovery-box" aria-label="계정 복구 코드">
      <h2>복구 코드를 따로 보관해 주세요</h2>
      <p>
        비밀번호를 잊었을 때 이 코드로 계정을 복구합니다. 이 화면을 떠나면 코드를 다시 볼 수 없어요.
      </p>
      <code>{code}</code>
      <button
        type="button"
        onClick={() =>
          downloadText(
            'choriClass-복구코드.txt',
            'choriClass 계정 복구 코드\n\n' +
              code +
              '\n\n다른 사람에게 공유하지 마세요. 복구하거나 재발급하면 이전 코드는 사용할 수 없습니다.\n',
          )
        }
      >
        복구 코드 파일 저장
      </button>
      <small>다른 사람과 공유하지 마세요. 재발급하면 이전 코드는 만료됩니다.</small>
    </section>
  );
}
export function Empty({ title, children }) {
  return (
    <div className="empty">
      <Archive aria-hidden="true" />
      <h3>{title}</h3>
      {children && <div>{children}</div>}
    </div>
  );
}
export function Art({ item }) {
  const [broken, setBroken] = useState('');
  const Icon =
    { 장비: Swords, 의상: Shirt, 장식: Sparkles, 수집품: Gem, 기타: Box }[item.category] || Gem;
  return item.image_url && broken !== item.image_url ? (
    <img
      className="item-image"
      src={item.image_url}
      alt={item.name || '아이템 미리보기'}
      onError={() => setBroken(item.image_url)}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className={'item-art art-' + categories.indexOf(item.category)}>
      <Icon aria-hidden="true" />
    </span>
  );
}
export function Head({ label, title, children }) {
  return (
    <header className="page-heading">
      <small className="eyebrow">{label}</small>
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  );
}
export function passwordHint(pw) {
  if (Array.from(pw).length < 8 || new TextEncoder().encode(pw).length > 72)
    return '비밀번호는 8자 이상, UTF-8 기준 72바이트 이하로 입력해 주세요.';
  return '';
}
