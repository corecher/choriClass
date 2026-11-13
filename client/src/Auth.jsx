import React, { useId, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Coins,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Alert, RecoveryCode, api, go, passwordHint, useAction } from './common.jsx';

function ArchivePlate() {
  return (
    <aside className="archive-panel">
      <div className="archive-top">
        <span className="eyebrow">
          <i /> COLLECTOR’S ARCHIVE
        </span>
        <span className="serial">VOL. 01</span>
      </div>
      <div className="archive-copy">
        <h2>
          choriClass
          <br />
          <em>나만의 아이템 창고</em>
        </h2>
        <p>
          아이템을 만들고, 수집하고, 거래하는
          <br />
          수집가들의 작은 아카이브.
        </p>
      </div>
      <figure className="artboard">
        <span className="fig-label">FIG. 001</span>
        <span className="cross c1">+</span>
        <span className="cross c2">+</span>
        <img src="/atelier.svg" alt="보석과 물약, 별 장식이 담긴 연보라색 보물상자" />
        <figcaption>
          <span className="sample-tag">
            <Box size={13} /> 소장품 도감
          </span>
        </figcaption>
      </figure>
      <div className="archive-caption">
        <span className="caption-number">01</span>
        <div>
          <small>ARCHIVE OBJECT</small>
          <b>수집가의 보물상자</b>
        </div>
        <span className="barcode" aria-hidden="true" />
      </div>
    </aside>
  );
}
export function PasswordField({
  label = '비밀번호',
  name = 'password',
  autoComplete = 'new-password',
  placeholder = '8자 이상 입력해 주세요',
  required = true,
}) {
  const [show, setShow] = useState(false);
  const inputId = useId();
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <span className="input-wrap">
        <LockKeyhole size={17} />
        <input
          id={inputId}
          type={show ? 'text' : 'password'}
          name={name}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        <button
          className="eye"
          type="button"
          aria-label={label + (show ? ' 숨기기' : ' 표시')}
          aria-pressed={show}
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    </div>
  );
}
export default function Auth({ mode, onUser }) {
  const signup = mode === 'signup';
  const action = useAction();
  const [created, setCreated] = useState(null);
  async function submit(e) {
    e.preventDefault();
    const input = Object.fromEntries(new FormData(e.currentTarget));
    action.run(async () => {
      if (signup) {
        if (!input.nickname.trim()) throw new Error('닉네임을 입력해 주세요.');
        const hint = passwordHint(input.password);
        if (hint) throw new Error(hint);
        if (input.password !== input.confirm) throw new Error('비밀번호 확인이 일치하지 않습니다.');
      }
      const result = await api('auth/' + mode, 'POST', {
        email: input.email,
        nickname: input.nickname,
        password: input.password,
      });
      if (signup) {
        setCreated(result);
        onUser(result.user);
      } else {
        onUser(result.user);
        const destination = sessionStorage.getItem('chori:returnTo');
        sessionStorage.removeItem('chori:returnTo');
        go(
          destination &&
            /^(buy\/\d+|studio|inventory|sales|trades|profile|new|edit\/\d+)$/.test(destination)
            ? destination
            : 'studio',
        );
      }
    });
  }
  return (
    <main className="auth-page">
      <div className="auth-layout">
        <ArchivePlate />
        <section className="auth-card">
          {created ? (
            <div className="welcome">
              <span className="success-icon">
                <Check />
              </span>
              <small className="eyebrow">REGISTRATION COMPLETE</small>
              <h1>가입이 완료되었어요</h1>
              <p>
                {created.user.nickname} 님의 창고에 첫 <strong>1,000 G</strong>가 지급되었습니다.
              </p>
              <RecoveryCode code={created.recoveryCode} />
              <button className="primary" onClick={() => go('studio')}>
                내 제작소로 이동 <ArrowRight size={17} />
              </button>
              <a href="#/catalog">
                전체 도감 둘러보기 <ArrowUpRight size={14} />
              </a>
            </div>
          ) : (
            <>
              <span className="eyebrow form-stamp">
                <Sparkles size={14} />
                {signup ? 'COLLECTOR REGISTRATION' : 'COLLECTOR ACCESS'}
              </span>
              <h1>{signup ? '회원가입' : '로그인'}</h1>
              <p className="form-subtitle">
                {signup
                  ? '나만의 창고를 열고 첫 수집을 시작하세요.'
                  : '이메일과 비밀번호로 내 창고에 들어오세요.'}
              </p>
              <form onSubmit={submit}>
                <label className="field">
                  <span>이메일</span>
                  <span className="input-wrap">
                    <Mail size={17} />
                    <input
                      name="email"
                      type="email"
                      maxLength="255"
                      autoComplete="email"
                      placeholder="collector@example.com"
                      required
                    />
                  </span>
                </label>
                {signup && (
                  <label className="field">
                    <span>닉네임</span>
                    <span className="input-wrap">
                      <UserRound size={17} />
                      <input
                        name="nickname"
                        maxLength="30"
                        autoComplete="nickname"
                        placeholder="도감에 표시할 이름"
                        required
                      />
                    </span>
                  </label>
                )}
                <PasswordField
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  placeholder={signup ? '8자 이상 입력해 주세요' : '비밀번호를 입력해 주세요'}
                />
                {signup && (
                  <PasswordField
                    label="비밀번호 확인"
                    name="confirm"
                    placeholder="비밀번호를 한 번 더 입력해 주세요"
                  />
                )}
                <Alert message={action.error} />
                {signup && (
                  <div className="bonus">
                    <span className="coin">
                      <Coins size={18} />
                    </span>
                    <span>신규 수집가 보너스</span>
                    <b>1,000 G</b>
                  </div>
                )}
                <button className="primary" disabled={action.busy}>
                  {action.busy ? '처리 중…' : signup ? '가입하고 창고 열기' : '로그인'}
                  <ArrowRight size={17} />
                </button>
              </form>
              {!signup && (
                <a className="recovery-link" href="#/recover">
                  비밀번호를 잊으셨나요?
                </a>
              )}
              {signup && (
                <p className="form-note">
                  <a href="#/terms" target="_blank" rel="noreferrer">
                    이용안내
                  </a>
                  와{' '}
                  <a href="#/privacy" target="_blank" rel="noreferrer">
                    개인정보 처리안내
                  </a>
                  를 확인해 주세요. 가입 후 복구 코드를 꼭 저장하세요.
                </p>
              )}
              <div className="switch-mode">
                {signup ? '이미 계정이 있나요?' : '아직 계정이 없나요?'}{' '}
                <a href={signup ? '#/login' : '#/signup'}>
                  {signup ? '로그인' : '회원가입'}
                  <ChevronRight size={14} />
                </a>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
export function Recover({ onUser }) {
  const action = useAction();
  const [code, setCode] = useState('');
  return (
    <main className="content narrow">
      <header className="page-heading">
        <small className="eyebrow">ACCOUNT RECOVERY</small>
        <h1>비밀번호 재설정</h1>
        <p>가입할 때 저장한 복구 코드와 이메일을 입력하세요.</p>
      </header>
      {code ? (
        <section className="panel stack">
          <p className="notice" role="status">
            비밀번호를 변경하고 기존 로그인을 모두 종료했습니다.
          </p>
          <RecoveryCode code={code} />
          <a className="btn primary" href="#/login">
            새 비밀번호로 로그인
          </a>
        </section>
      ) : (
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(e.currentTarget));
            action.run(async () => {
              const hint = passwordHint(body.newPassword);
              if (hint) throw new Error(hint);
              if (body.newPassword !== body.confirm)
                throw new Error('비밀번호 확인이 일치하지 않습니다.');
              const result = await api('auth/reset-password', 'POST', body);
              onUser(null);
              setCode(result.recoveryCode);
            });
          }}
        >
          <label>
            이메일
            <input name="email" type="email" autoComplete="email" required maxLength="255" />
          </label>
          <label>
            복구 코드
            <input
              name="recoveryCode"
              autoComplete="off"
              spellCheck={false}
              required
              maxLength="60"
              placeholder="가입 후 저장한 코드"
            />
          </label>
          <PasswordField name="newPassword" label="새 비밀번호" />
          <PasswordField name="confirm" label="새 비밀번호 확인" />
          <Alert message={action.error} />
          <button className="primary" disabled={action.busy}>
            비밀번호 재설정
          </button>
          <p className="muted">
            복구 코드가 없으면 로그인된 기기의 마이페이지에서 재발급할 수 있습니다. 로그인과 복구
            코드가 모두 없으면 비밀번호를 재설정할 수 없습니다.
          </p>
          <a href="#/login">로그인으로 돌아가기</a>
        </form>
      )}
    </main>
  );
}
