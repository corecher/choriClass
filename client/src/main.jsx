import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookOpen,
  Boxes,
  Compass,
  Coins,
  LogIn,
  LogOut,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react';
import Auth from './Auth.jsx';
import Profile from './Profile.jsx';
import { Detail, Editor, Library } from './Library.jsx';
import { Inventory, Market, Trades } from './Market.jsx';
import { Alert, Empty, api, go, money, useAction, useRoute } from './common.jsx';
import './style.css';

function Brand() {
  return (
    <a className="brand" href="#/catalog" aria-label="취향창고 전체 도감">
      <img src="/mark.svg" alt="" />
      <span>
        <b>취향창고</b>
        <small>CHORI CLASS</small>
      </span>
    </a>
  );
}
function App() {
  const route = useRoute();
  const [session, setSession] = useState({ loading: true, user: null, home: 'signup', error: '' });
  const [revision, setRevision] = useState(0);
  const action = useAction();
  useEffect(() => {
    api('auth/me')
      .then(({ user }) =>
        setSession({ loading: false, user, home: user ? 'studio' : 'signup', error: '' }),
      )
      .catch((e) => setSession({ loading: false, user: null, home: 'signup', error: e.message }));
  }, []);
  const user = session.user;
  const onUser = (user) => setSession((current) => ({ ...current, user, error: '' }));
  const refresh = () => setRevision((n) => n + 1);
  const [page, id] = (route || session.home).split('/');
  useEffect(() => {
    if (!session.loading && user && !['signup', 'login'].includes(page)) {
      let live = true;
      api('auth/me')
        .then((r) => {
          if (live) onUser(r.user);
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }
  }, [page, revision, session.loading, user?.user_id]);
  const privatePages = ['studio', 'new', 'edit', 'profile', 'inventory', 'trades', 'sales'];
  let view;
  if (session.loading) view = <main className="content muted">창고를 여는 중…</main>;
  else if (privatePages.includes(page) && !user)
    view = (
      <main className="content">
        <Empty title="로그인 후 이용해 주세요">
          <a href="#/login">로그인 →</a>
        </Empty>
      </main>
    );
  else if (['signup', 'login'].includes(page))
    view = <Auth key={page} mode={page} onUser={onUser} />;
  else if (['catalog', 'creators', 'studio'].includes(page))
    view = <Library key={page} page={page} user={user} revision={revision} />;
  else if (page === 'item')
    view = <Detail key={id} itemId={id} user={user} refresh={refresh} revision={revision} />;
  else if (['new', 'edit'].includes(page))
    view = <Editor key={page + id} itemId={page === 'edit' ? id : null} refresh={refresh} />;
  else if (page === 'profile') view = <Profile user={user} onUser={onUser} />;
  else if (page === 'inventory') view = <Inventory revision={revision} refresh={refresh} />;
  else if (['market', 'buy', 'sales'].includes(page))
    view = (
      <Market
        key={page + id}
        page={page}
        user={user}
        listingId={id}
        revision={revision}
        refresh={refresh}
        onUser={onUser}
      />
    );
  else if (page === 'trades') view = <Trades user={user} revision={revision} />;
  else
    view = (
      <main className="content">
        <Empty title="페이지를 찾을 수 없습니다">
          <a href="#/catalog">도감으로 이동 →</a>
        </Empty>
      </main>
    );
  const nav = [
    ['catalog', '전체 도감', BookOpen],
    ['creators', '제작자별 도감', Compass],
    ['market', '시장', Store],
  ];
  return (
    <div className="shell">
      <header className="top">
        <div className="top-inner">
          <Brand />
          <nav className="public-nav" aria-label="공개 메뉴">
            {nav.map(([key, title, Icon]) => (
              <a className={page === key ? 'active' : ''} key={key} href={'#/' + key}>
                <Icon size={16} />
                {title}
              </a>
            ))}
          </nav>
          <div className="account-nav">
            {user ? (
              <>
                <a href="#/profile">
                  <Coins size={16} />
                  {money(user.gold_balance)}
                </a>
                <button
                  aria-label="로그아웃"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(async () => {
                      await api('auth/logout', 'POST');
                      onUser(null);
                      go('login');
                    })
                  }
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <>
                <a href="#/login">
                  <LogIn size={16} /> 로그인
                </a>
                <a className="join-nav" href="#/signup">
                  <UserRound size={15} /> 회원가입
                </a>
              </>
            )}
          </div>
        </div>
      </header>
      {user && (
        <nav className="member-nav" aria-label="개인 메뉴">
          {[
            ['studio', '내 제작소'],
            ['inventory', '내 인벤토리'],
            ['sales', '내 판매 관리'],
            ['trades', '거래 내역'],
            ['profile', '마이페이지'],
          ].map(([key, label]) => (
            <a className={key === page ? 'active' : ''} key={key} href={'#/' + key}>
              {label}
            </a>
          ))}
        </nav>
      )}
      <Alert message={action.error || session.error} />
      {view}
      <footer>
        <div className="footer-inner">
          <span>
            <Boxes size={17} /> <b>취향창고</b>
            <small>© CHORI CLASS</small>
          </span>
          <span>
            <ShieldCheck size={14} /> 수집가 아카이브
          </span>
        </div>
      </footer>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
