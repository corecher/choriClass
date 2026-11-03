import React, { useState } from 'react';
import { Alert, Head, api, go, money, passwordHint, useAction } from './common.jsx';
import { PasswordField } from './Auth.jsx';
export default function Profile({ user, onUser }) {
  const action = useAction();
  const [notice, setNotice] = useState('');
  const [withdraw, setWithdraw] = useState(false);
  function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    action.run(async () => {
      if (body.newPassword && passwordHint(body.newPassword))
        throw new Error(passwordHint(body.newPassword));
      const { user } = await api('auth/me', 'PATCH', body);
      onUser(user);
      form.elements.currentPassword.value = '';
      form.elements.newPassword.value = '';
      setNotice('프로필을 저장했습니다.');
    });
  }
  return (
    <main className="content narrow">
      <Head label="COLLECTOR PROFILE" title="마이페이지">
        {user.email} · 보유 골드 {money(user.gold_balance)}
      </Head>
      <form className="panel stack" onSubmit={save}>
        <h2>내 프로필</h2>
        <label>
          닉네임
          <input name="nickname" defaultValue={user.nickname} maxLength="30" required />
        </label>
        <label>
          공개 소개
          <textarea name="bio" defaultValue={user.bio} maxLength="300" rows="3" />
        </label>
        <PasswordField
          name="currentPassword"
          label="현재 비밀번호"
          placeholder="비밀번호를 변경할 때 입력"
          autoComplete="current-password"
          required={false}
        />
        <PasswordField
          name="newPassword"
          label="새 비밀번호"
          placeholder="변경할 때만 입력"
          required={false}
        />
        {!withdraw && <Alert message={action.error} />}
        <button className="primary" disabled={action.busy}>
          프로필 저장
        </button>
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
      </form>
      <section className="panel stack">
        <h2>회원 탈퇴</h2>
        <p className="muted">탈퇴하면 내 원본의 제작이 종료되고 남은 판매 매물이 취소됩니다.</p>
        {withdraw ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const body = Object.fromEntries(new FormData(e.currentTarget));
              action.run(async () => {
                await api('auth/me', 'DELETE', {
                  currentPassword: body.currentPassword,
                  confirm: body.confirm === 'on',
                });
                onUser(null);
                go('signup');
              });
            }}
          >
            <PasswordField
              name="currentPassword"
              label="탈퇴 확인용 비밀번호"
              autoComplete="current-password"
              placeholder="현재 비밀번호"
            />
            <label className="check">
              <input type="checkbox" name="confirm" required /> 위 내용을 확인하고 탈퇴합니다.
            </label>
            <Alert message={action.error} />
            <button className="danger" disabled={action.busy}>
              회원 탈퇴 확정
            </button>
            <button type="button" onClick={() => setWithdraw(false)}>
              취소
            </button>
          </form>
        ) : (
          <button
            className="danger"
            onClick={() => {
              action.setError('');
              setWithdraw(true);
            }}
          >
            탈퇴 절차 열기
          </button>
        )}
      </section>
    </main>
  );
}
