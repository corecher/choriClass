import React, { useState } from 'react';
import { ArrowRight, BookOpen, Boxes, Hammer, Store } from 'lucide-react';
import { Empty, Head, Load, Paged, useData } from './common.jsx';

export function CreatorStats({ revision }) {
  const state = useData('reports/creator-stats', revision);
  const [query, setQuery] = useState('');
  return (
    <main className="content">
      <Head label="CREATOR RECORDS" title="제작자 통계">
        제작자마다 등록한 원본 수와 현재 공개된 원본의 누적 생산량을 확인하세요.
      </Head>
      <div className="toolbar">
        <label className="search">
          <input
            aria-label="제작자 닉네임 검색"
            placeholder="제작자 닉네임 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <a className="btn" href="#/creators">
          제작자별 도감 <ArrowRight size={15} />
        </a>
      </div>
      <Load state={state}>
        {(rows) => {
          const filtered = rows.filter((r) =>
            r.nickname.toLowerCase().includes(query.trim().toLowerCase()),
          );
          if (!filtered.length)
            return (
              <Empty title="조건에 맞는 제작자가 없어요">다른 닉네임으로 검색해 보세요.</Empty>
            );
          return (
            <Paged rows={filtered}>
              {(page) => (
                <div className="creator-stats">
                  {page.map((creator) => (
                    <article className="panel creator-stat" key={creator.user_id}>
                      <span className="creator-avatar" aria-hidden="true">
                        {creator.nickname.slice(0, 1)}
                      </span>
                      <div>
                        <h2>{creator.nickname}</h2>
                        <p className="muted">{creator.bio || '아직 공개 소개가 없습니다.'}</p>
                      </div>
                      <dl className="stat-numbers">
                        <div>
                          <dt>공개 원본</dt>
                          <dd>{creator.item_count.toLocaleString()}종</dd>
                        </div>
                        <div>
                          <dt>누적 생산량</dt>
                          <dd>{BigInt(creator.total_produced).toLocaleString('ko-KR')}개</dd>
                        </div>
                      </dl>
                      <a className="btn" href={'#/creators/' + creator.user_id}>
                        만든 아이템 보기 <ArrowRight size={15} />
                      </a>
                    </article>
                  ))}
                </div>
              )}
            </Paged>
          );
        }}
      </Load>
    </main>
  );
}

const content = {
  help: {
    title: '이용 가이드',
    label: 'GETTING STARTED',
    intro: '원본을 만들고 수집하는 과정을 차례대로 살펴보세요.',
    sections: [
      [
        '1. 계정과 내 창고',
        '이메일·닉네임·비밀번호로 가입하면 1,000G가 한 번 지급됩니다. 가입 완료 화면의 복구 코드는 따로 저장하세요. 마이페이지에서 프로필과 비밀번호를 바꾸거나 복구 코드를 재발급할 수 있습니다.',
      ],
      [
        '2. 원본 등록과 생산',
        '내 제작소에서 이름·분류·설명을 입력해 원본을 등록하세요. 이미 사용된 이름은 공백·대소문자를 바꿔도 등록할 수 없습니다. 최초 제작자만 원본 상세에서 수량을 입력해 생산할 수 있습니다.',
      ],
      [
        '3. 수정과 제작 종료',
        '이름과 최초 제작자는 고정됩니다. 첫 생산 후에는 분류와 이미지도 고정되고 설명만 수정할 수 있습니다. 제작 종료는 새 생산을 막으며, 사용한 이름과 기존 보유분은 남습니다.',
      ],
      [
        '4. 인벤토리와 시장',
        '내 인벤토리에서 보유·예약·판매 가능 수량을 확인하고, 수량과 개당 가격을 정해 판매하세요. 구매한 아이템도 재판매할 수 있지만 원본 수정·생산 권한은 이전되지 않습니다.',
      ],
      [
        '5. 구매와 판매 취소',
        '시장에서 매물을 고른 뒤 구매 확인 화면에서 수량·총액·잔액을 확인하세요. 자기 매물은 살 수 없습니다. 판매 취소는 아직 팔리지 않은 수량의 예약만 해제합니다. 매물의 조건은 취소 후 다시 등록해 바꿀 수 있습니다.',
      ],
      [
        '6. 공개 정보와 탈퇴',
        '전체 도감·제작자별 도감·제작자 통계·시장은 누구나 볼 수 있습니다. 이메일·잔액·개인 메모·내 거래 기록은 본인만 확인합니다. 탈퇴하면 로그인과 본인 판매가 종료되며, 다른 회원의 보유분과 거래 기록은 유지됩니다.',
      ],
    ],
  },
  terms: {
    title: '이용안내',
    label: 'SERVICE GUIDE',
    intro: 'choriClass는 디지털 아이템을 제작·보관·교환하는 아이템 수집 게임입니다.',
    sections: [
      [
        '서비스와 가상 골드',
        '아이템과 골드 G는 이 서비스 안에서만 사용하는 가상 데이터입니다. 현금 결제·출금 기능은 없으며 가입 보너스는 계정 생성 시 1,000G입니다. 생산 비용과 거래 수수료는 0G입니다.',
      ],
      [
        '계정과 콘텐츠',
        '직접 사용할 이메일과 비밀번호를 입력하고 복구 코드를 안전하게 보관하세요. 아이템 이름·설명·이미지에는 사용 권한이 있는 자료를 등록하고, 타인의 개인 정보나 부적절한 내용을 게시하지 마세요.',
      ],
      [
        '원본과 거래',
        '원본의 이름과 최초 제작자는 등록 후 고정됩니다. 삭제한 이름도 재사용할 수 없습니다. 거래가 완료되면 수량과 골드가 즉시 이전되고 완료 거래는 수정하거나 삭제할 수 없습니다. 구매 전 수량과 금액을 확인하세요.',
      ],
      [
        '서비스 사용',
        '다른 회원의 계정이나 데이터를 무단으로 변경하려고 시도하지 마세요. 평가 환경의 서버가 실행되는 동안 이용할 수 있으며 계정 복구에는 저장한 복구 코드가 필요합니다.',
      ],
    ],
  },
  privacy: {
    title: '개인정보 처리안내',
    label: 'YOUR INFORMATION',
    intro: '현재 구현에서 어떤 정보를 저장하고 공개하는지 안내합니다.',
    sections: [
      [
        '저장하는 정보와 목적',
        '회원 식별과 로그인을 위해 이메일·닉네임·비밀번호 해시·가입 시각을 저장합니다. 공개 소개, 가상 골드, 아이템, 생산·판매·거래 기록과 개인 메모는 계정과 서비스 기능을 제공하기 위해 저장합니다. 비밀번호와 복구 코드의 원문은 DB에 저장하지 않습니다.',
      ],
      [
        '공개되는 정보',
        '닉네임·공개 소개·등록한 아이템·원본의 누적 생산량·판매 매물은 공개됩니다. 이메일·비밀번호 해시·복구 코드 해시·골드 잔액·전체 재고·개인 메모와 본인 거래 기록은 공개 API에 포함하지 않습니다.',
      ],
      [
        '로그인 쿠키',
        '로그인 상태를 유지하는 필수 쿠키를 사용합니다. 기본 유효기간은 7일입니다. 로그아웃·비밀번호 복구·회원 탈퇴 시 해당 로그인은 종료됩니다. 분석·광고 쿠키는 사용하지 않습니다.',
      ],
      [
        '외부 이미지',
        '등록한 이미지 주소는 브라우저가 해당 외부 서버에 직접 요청합니다. 외부 이미지 서버에 IP 주소 등이 전달될 수 있으므로 사용 권한과 공개 범위를 확인한 주소를 사용하세요. 이미지가 없거나 열리지 않으면 기본 그림을 표시합니다.',
      ],
      [
        '정보 관리와 탈퇴',
        '마이페이지에서 닉네임·소개·비밀번호를 바꾸고 본인 정보 파일을 내려받을 수 있습니다. 탈퇴하면 이메일·비밀번호 해시·복구 코드 해시·소개를 비우고 닉네임을 탈퇴 회원으로 바꿉니다. 거래 관계를 유지하기 위해 사용 중지된 골드·재고·원본·생산·거래 기록과 회원 번호는 남습니다.',
      ],
    ],
  },
};
export function Info({ page }) {
  const entry = content[page];
  return (
    <main className="content narrow">
      <Head label={entry.label} title={entry.title}>
        {entry.intro}
      </Head>
      {page === 'help' && (
        <div className="guide-links">
          <a className="btn" href="#/studio">
            <Hammer size={16} /> 내 제작소
          </a>
          <a className="btn" href="#/inventory">
            <Boxes size={16} /> 인벤토리
          </a>
          <a className="btn" href="#/market">
            <Store size={16} /> 시장
          </a>
        </div>
      )}
      <article className="panel prose">
        {entry.sections.map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
      </article>
      <a className="btn" href="#/catalog">
        <BookOpen size={16} /> 전체 도감으로
      </a>
    </main>
  );
}
