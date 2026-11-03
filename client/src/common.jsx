import React, { useEffect, useState, useRef } from 'react';
import { Archive, Gem } from 'lucide-react';

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
  const response = await fetch('/api/' + path, {
    method,
    credentials: 'same-origin',
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  if (response.status === 204) return;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || '요청을 완료하지 못했습니다.');
  return result;
}
export function useData(path, revision = 0) {
  const [state, setState] = useState({ data: null, error: '' });
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
  }, [path, revision]);
  return state;
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
  if (state.error) return <Alert message={state.error} />;
  if (!state.data)
    return (
      <p role="status" className="muted">
        불러오는 중…
      </p>
    );
  return children(state.data);
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
  return item.image_url && broken !== item.image_url ? (
    <img
      className="item-image"
      src={item.image_url}
      alt={item.name || '아이템 미리보기'}
      onError={() => setBroken(item.image_url)}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="item-art">
      <Gem aria-hidden="true" />
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
