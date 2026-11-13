# choriClass 코드 설명

수행평가에서 회원 CRUD, 아이템 CRUD, JOIN과 거래 처리를 설명하기 위한 안내입니다. 기본 테이블의 관계를 이해한 다음 생산과 거래를 따라가세요.

## 테이블 관계

`users.user_id`는 회원 번호, `items.creator_id`는 최초 제작자 번호, `items.item_id`는 원본 종류의 번호입니다. 구매자가 바뀌어도 최초 제작자는 바뀌지 않습니다. `inventories`는 `(user_id, item_id)` 조합으로 보유 수량을 저장합니다.

회원과 아이템은 외래 키로 연결되므로 논리 삭제를 사용합니다. 원본은 `RETIRED`, 회원은 `WITHDRAWN`으로 바꾸고 삭제 시각을 기록합니다. 구매자의 재고와 거래 이력을 유지하기 위해서입니다.

## 요청 처리 순서

브라우저의 `api`가 요청하면 `server/index.js`가 JSON과 출처를 검사합니다. 버튼을 숨기는 것만으로는 보호할 수 없으므로 서버가 권한을 다시 확인합니다.

1. `requireUser`: 쿠키와 DB에서 로그인·만료 시각·활성 계정을 확인합니다.
2. `field`, `password`, `positive`: 문자열 길이·숫자 범위를 검사합니다.
3. `ownedItem`: 로그인 회원과 최초 제작자를 비교합니다.
4. `db.execute(sql, [값들])`: SQL의 `?`에 값을 별도로 전달합니다. 사용자 입력을 SQL에 직접 붙이지 않습니다.
5. `await`: DB 작업 완료를 기다린 뒤 응답합니다. 실패하면 오류 안내를 보냅니다.

## 비밀번호와 로그인

가입 시 `bcrypt.hash`, 로그인 시 `bcrypt.compare`를 사용하며 평문 비밀번호를 저장하거나 복원하지 않습니다. bcrypt의 72바이트 제한 때문에 UTF-8 바이트 길이도 검사합니다.

회원·세션을 같은 가입 트랜잭션에 저장합니다. 초기 골드는 DB 기본값 1000이고 이메일 UNIQUE 제약이 동시 중복 가입을 막습니다. 세션 난수는 HttpOnly 쿠키로 전달하고 DB에는 해시를 저장합니다.

로그아웃은 현재 세션, 비밀번호 변경·복구·탈퇴는 모든 세션을 종료합니다. 비밀번호 변경 후 현재 화면에는 새 세션을 발급합니다. 복구 코드는 24바이트 난수이며 해시만 저장합니다. 복구 성공 시 교체되므로 재사용할 수 없습니다.

## 원본 중복과 권한

이름을 NFKC 정규화하고 공백 제거·영문 소문자 변환한 값이 `name_key`입니다. UNIQUE 제약으로 같은 키는 한 번만 등록되고 삭제 후에도 키를 남깁니다.

작성자 번호는 요청 본문 대신 로그인 정보에서 정합니다. 수정·삭제·생산도 최초 제작자를 검사합니다. 이름과 제작자는 고정하고 첫 생산 후 분류·이미지도 고정합니다. 구매자는 보유분을 재판매할 수 있지만 생산할 수 없습니다.

## 평가용 JOIN 두 가지

1. 제작자별 도감: `users.user_id = items.creator_id`로 회원과 원본을 연결해 최신 닉네임·소개·아이템을 함께 표시합니다.
2. 제작자 통계: 같은 두 테이블을 LEFT JOIN하고 회원별 GROUP BY로 원본 수·생산량을 집계합니다. 활성 원본 조건을 ON에 두어 원본 없는 회원도 유지합니다. COUNT는 NULL인 아이템 번호를 세지 않고 COALESCE는 NULL 합계를 0으로 바꿉니다.

`database/evaluation-joins.sql`에 SQL과 화면 위치가 있습니다. 공개 결과에는 이메일·비밀번호 해시·골드를 선택하지 않습니다.

## 생산과 거래

`transaction`은 성공하면 COMMIT, 실패하면 ROLLBACK합니다. 골드 차감 후 재고 저장이 실패해도 전체를 취소하고 마지막에는 연결을 pool에 반환합니다.

수업용 서버는 `write_lock` 한 행을 `SELECT ... FOR UPDATE`로 잠급니다. 생산·판매·구매·탈퇴를 순서대로 처리하여 다음 요청이 이전 결과를 확인하게 합니다. 이해하기 쉬운 대신 쓰기 처리량은 제한됩니다.

- 생산: 제작자 확인 → 누적 수량 증가 → 제작자 재고 증가 → 이력 저장.
- 판매: 보유량 − 예약량 검사 → 예약 증가 → 매물 생성. 예약은 전체 보유량에 포함됩니다.
- 구매: 중복·매물·계정·수량·골드 확인 → 골드 이동 → 양쪽 재고·예약·잔량 변경 → 거래 기록.
- 취소: 판매자 확인 → ACTIVE 매물의 미판매 예약 해제 → CANCELED 변경. 반복 취소는 다시 차감하지 않습니다.
- 탈퇴: 비밀번호 확인 → 본인 매물 취소·예약 해제 → 원본 제작 종료 → 식별 정보·세션 정리.

생산·판매·구매의 `request_key`는 중복 처리를 막습니다. 같은 회원의 같은 키·같은 내용은 기존 결과, 같은 키의 다른 내용은 409입니다. 네트워크 재시도로 수량과 골드가 두 번 바뀌지 않게 합니다.

## 검증 조건

- 누적 생산량 = 생산 이력 수량 합계 = 전체 보유량 합계.
- 회원별 예약량 = 해당 아이템의 ACTIVE 매물 잔량 합계.
- `0 ≤ 예약량 ≤ 보유량`, 판매 가능량 = 보유량 − 예약량.
- 거래 전후 구매자와 판매자 골드 합계 동일.
- 탈퇴 회원의 사용 중지 재고도 전체 보유량에 포함.

`test/integration.test.js`가 별도 DB에서 실제 API로 검증합니다.

## 2026년 11월 13일 평가 기준 점검

프로젝트의 회원 CRUD 4개, 아이템 CRUD 4개, 회원·아이템 두 테이블 JOIN 결과 2개는 구현되어 있으며 현재 소스의 실제 MySQL 통합 테스트 11개와 화면 빌드가 통과했습니다. 평가용 DB에 접속해 실제 이름이 `chori_class_20510`인 것도 확인했습니다. 아래 상태는 코드 검증 결과이며 선생님이 확정한 점수가 아닙니다.

| 평가 또는 제출 항목 | 점검 결과 | 확인 근거 또는 남은 일 |
| --- | --- | --- |
| SQL 문제해결 40점 | 제출 여부 확인 불가 | 클래스룸 9문제 × 3점 + 기본 13점. 클래스룸에서 9개 제출·채점·마감을 직접 확인해야 함 |
| DB명 `_학번` 접미사 | 충족 | 실제 연결 DB `chori_class_20510`, 설정 예시·생성 SQL도 일치 |
| 회원 CRUD 16점 | 기능 검증 통과 | 가입, 본인 조회, 프로필·비밀번호 변경, 탈퇴와 로그인 종료 |
| 핵심 데이터 CRUD 16점 | 기능 검증 통과 | 아이템 원본 등록·목록·상세·수정·제작 종료, 다른 회원의 변경 차단 |
| 두 테이블 JOIN 결과 2개 8점 | 기능 검증 통과 | 제작자별 도감과 제작자 통계, 두 SQL 모두 실제 DB에서 실행 확인 |
| 기본점수 20점 | 교사 평가 항목 | 코드 테스트 결과와 별도로 적용되는 기본점수 |
| 새 폴더 설치·실행 준비 | 로컬 검증 완료 | `.env`, `.local`, `node_modules` 없이 소스를 복사한 폴더에서 `npm ci`·빌드·통합 테스트 11개 통과. DB 테스트는 별도 테스트 DB 접속 정보를 전달해 수행 |
| 학교 실습실 PC 실행 | 현장 확인 필요 | 학교 PC에서 MySQL 시작 후 README의 설치·설정·실행 절차로 직접 확인해야 함 |
| 완성본 GitHub push | 아직 완료되지 않음 | 확인 시 원격 main은 `41e6158`이고 현재 기능 변경과 새 파일은 미커밋 상태. `server/reports.js`와 `database/evaluation-joins.sql`도 기존 커밋에 없음 |
| 저장소 URL 비공개 댓글 | 확인 불가 | GitHub push 후 수업 과제의 비공개 댓글에 저장소 URL을 제출해야 함 |

최신 프로젝트 제출 마감은 **11월 16일 아침까지**입니다. 정확한 아침 시각은 제공되지 않았습니다. 기존 11월 15일 23:59 안내를 최신 기준으로 수정했습니다. 프로젝트 지각은 1일당 4점 감점, SQL 과제 지각은 9점 감점입니다. SQL 과제의 별도 마감 시각은 제공되지 않았습니다.

현재 연결된 저장소: [corecher/choriClass](https://github.com/corecher/choriClass). 위 점검만으로 commit·push하거나 수업 댓글을 작성하지 않았습니다. 제출할 때는 로컬 변경과 새 파일을 모두 포함해야 하며 `.env`와 `.local`은 제외합니다.

## 질문을 받으면 먼저 열 파일

서버가 실제 DB를 읽고 바꾸는 코드를 먼저 열고, 화면 입력 과정을 물으면 해당 React 파일을 이어서 여세요. VS Code에서 Ctrl+P로 파일 경로를 열고 Ctrl+F로 아래 검색어를 찾으면 됩니다. 줄 번호는 이후 수정으로 달라질 수 있으므로 검색어도 함께 적었습니다.

| 선생님 질문 | 먼저 열 파일과 현재 줄 | Ctrl+F 검색어 | 핵심 설명 |
| --- | --- | --- | --- |
| 회원가입은 어디서 하나요? | [server/auth.js](../server/auth.js#L60) 60줄 | `accounts.post('/signup'` | 이메일·닉네임·비밀번호를 검사하고 해시를 만든 뒤 users에 INSERT합니다. 초기 골드는 DB 기본값 1000입니다. |
| 회원정보 조회는 어디인가요? | [server/auth.js](../server/auth.js#L59) 59줄 | `accounts.get('/me'` | 쿠키로 확인한 로그인 회원의 본인 정보만 반환합니다. 비밀번호 해시는 응답하지 않습니다. |
| 로그인은 어떻게 확인하나요? | [server/auth.js](../server/auth.js#L89) 89줄 | `accounts.post('/login'` | 활성 계정의 이메일을 조회하고 bcrypt.compare로 비밀번호를 확인한 뒤 로그인 세션을 만듭니다. |
| 회원정보 수정은 어디인가요? | [server/auth.js](../server/auth.js#L179) 179줄 | `accounts.patch('/me'` | 로그인한 본인의 닉네임·소개를 UPDATE합니다. 비밀번호 변경은 현재 비밀번호도 확인합니다. |
| 회원 삭제는 어디인가요? | [server/auth.js](../server/auth.js#L217) 217줄 | `accounts.delete('/me'` | 현재 비밀번호·탈퇴 의사를 확인하고 계정을 WITHDRAWN으로 바꿉니다. 식별 정보와 세션을 정리하고 본인 매물을 취소합니다. |
| 아이템 등록은 어디인가요? | [server/items.js](../server/items.js#L37) 37줄 | `items.post('/'` | 로그인한 회원을 creator_id로 사용하고 검증한 이름·분류·설명·이미지를 items에 INSERT합니다. |
| 전체 조회와 상세 조회는요? | [server/items.js](../server/items.js#L11) 11줄 | `items.get('/'` 또는 `items.get('/:id'` | 목록은 활성 원본을, 상세는 요청 번호의 원본을 SELECT합니다. 상세는 제작 종료된 원본도 확인할 수 있습니다. |
| 아이템 수정은 어디인가요? | [server/items.js](../server/items.js#L70) 70줄 | `items.patch('/:id'` | 최초 제작자인지 검사하고 분류·설명·이미지를 UPDATE합니다. 첫 생산 후에는 설명만 바꿀 수 있습니다. |
| 아이템 삭제는 어디인가요? | [server/items.js](../server/items.js#L86) 86줄 | `items.delete('/:id'` | 최초 제작자만 status를 RETIRED로 바꾸고 deleted_at을 기록합니다. 목록에서 숨겨지고 새 생산을 막습니다. |
| JOIN 첫 번째 결과는요? | [server/items.js](../server/items.js#L9) 9줄 | `const catalog` | items.creator_id와 users.user_id를 JOIN해 원본과 최신 제작자 닉네임·소개를 함께 표시합니다. 화면 메뉴는 제작자별 도감입니다. |
| JOIN 두 번째 결과는요? | [server/reports.js](../server/reports.js#L7) 7줄 | `creatorStatsSql` | users와 items를 LEFT JOIN하고 회원별 GROUP BY로 원본 수와 생산량을 집계합니다. 화면 메뉴는 제작자 통계입니다. |
| 두 JOIN SQL만 보여주세요. | [database/evaluation-joins.sql](../database/evaluation-joins.sql#L1) 1줄 | `결과 1` 또는 `결과 2` | 정확히 users·items 두 테이블을 연결한 서로 다른 결과를 한 파일에서 설명할 수 있습니다. |
| 본인 아이템만 바꾸게 하는 코드는요? | [server/items.js](../server/items.js#L62) 62줄 | `ownedItem` | 원본의 creator_id와 로그인 회원 번호가 다르면 403으로 거절합니다. 화면 버튼과 별도로 서버가 검사합니다. |
| 로그인 안 한 사람은 어떻게 막나요? | [server/auth.js](../server/auth.js#L39) 39줄 | `requireUser` | 현재 쿠키의 세션·만료·회원 상태를 확인하고 로그인 회원이 없으면 401을 반환합니다. |
| 비밀번호를 그대로 저장하나요? | [server/auth.js](../server/auth.js#L65) 65줄 | `bcrypt.hash` / `bcrypt.compare` | 원문 대신 bcrypt 해시를 저장하고 로그인 때 비교합니다. 비밀번호 변경도 새 해시를 만듭니다. |
| DB 연결 설정은 어디인가요? | [server/db.js](../server/db.js#L4) 4줄 | `mysql.createPool` | 환경 설정의 주소·포트·계정·DB명을 읽어 MySQL 연결 풀을 만듭니다. 공개 설명에는 비밀번호가 없는 .env.example을 사용하세요. |
| DB명 끝이 학번인지 보여주세요. | [.env.example](../.env.example#L4) 4줄, [database/create-database.sql](../database/create-database.sql#L3) 3줄 | `chori_class_20510` | 설정과 생성 SQL의 DB명이 모두 _20510으로 끝납니다. 실제 DB에서는 SELECT DATABASE()로 확인할 수 있습니다. |
| 테이블과 기본키·외래키는 어디인가요? | [database/schema.sql](../database/schema.sql#L2) 2줄·24줄 | `CREATE TABLE IF NOT EXISTS users` / `items` | users.user_id와 items.item_id는 기본키이고 items.creator_id는 users.user_id를 참조하는 외래키입니다. |
| SQL의 물음표는 무슨 뜻인가요? | [server/items.js](../server/items.js#L49) 49줄 | `INSERT INTO items` | SQL과 사용자 값을 분리해서 전달하는 자리입니다. ? 순서대로 배열의 값이 바인딩됩니다. |
| 중복 원본을 어떻게 막나요? | [server/items.js](../server/items.js#L37) 37줄, [database/schema.sql](../database/schema.sql#L28) 28줄 | `normalize('NFKC')` / `name_key` | 이름을 정규화해 공백·영문 대소문자 차이를 합치고 DB UNIQUE 제약으로 중복을 막습니다. |
| 왜 DELETE SQL 대신 UPDATE인가요? | [server/items.js](../server/items.js#L86) 86줄, [server/auth.js](../server/auth.js#L217) 217줄 | `RETIRED` / `WITHDRAWN` | 논리 삭제입니다. 거래한 다른 회원의 재고와 이력을 끊지 않으면서 이용과 생산을 종료합니다. |
| 거래 도중 오류가 나면요? | [server/db.js](../server/db.js#L38) 38줄 | `transaction` | 모두 성공하면 commit하고 하나라도 실패하면 rollback하여 골드와 재고 변경을 함께 취소합니다. |
| 생산·인벤토리·구매는 어디인가요? | [server/economy.js](../server/economy.js#L39) 39줄·76줄·170줄 | `'/production'` / `'/inventory'` / `'/market/:id/buy'` | 최초 제작자 생산, 본인 보유량 조회, 구매자의 골드와 양쪽 수량 이동을 처리합니다. |
| 같은 버튼을 여러 번 누르면요? | [server/economy.js](../server/economy.js#L8) 8줄·15줄 | `requestKey` / `replay` | 동일 요청 키·내용이면 저장된 결과를 반환하고 다른 내용으로 키를 재사용하면 거절합니다. |
| 동시에 마지막 한 개를 사면요? | [server/db.js](../server/db.js#L38) 38줄 | `FOR UPDATE` | 쓰기 잠금 순서를 통일해 먼저 처리한 결과를 다음 구매가 확인하도록 합니다. 남은 수량보다 많이 팔리지 않습니다. |
| 학교 PC에서는 무엇을 실행하나요? | [README.md](../README.md#L7) 7줄, [scripts/setup.js](../scripts/setup.js#L42) 42줄 | `학교 실습실` / `const student` | MySQL을 켜고 npm ci → npm run setup → npm run dev를 실행합니다. setup이 학번 DB와 앱 계정을 준비합니다. |
| 클라이언트와 서버는 어떻게 연결되나요? | [client/src/common.jsx](../client/src/common.jsx#L22) 22줄, [server/index.js](../server/index.js#L50) 50줄 | `export async function api` / `app.use('/api/auth'` | 브라우저가 같은 주소의 /api로 요청하고 Express가 회원·아이템·통계 처리기로 연결합니다. 개발 실행 하나가 화면과 API를 제공합니다. |

## 화면 코드를 추가로 요청할 때

| 화면 질문 | 열 파일 | 찾을 부분 |
| --- | --- | --- |
| 회원가입·로그인 폼 | [client/src/Auth.jsx](../client/src/Auth.jsx#L96) | `export default function Auth`, submit 함수 |
| 마이페이지 수정·탈퇴 버튼 | [client/src/Profile.jsx](../client/src/Profile.jsx#L14) | `save`, `회원 탈퇴`, `api('auth/me', 'DELETE'` |
| 도감·제작소와 제작자 필터 | [client/src/Library.jsx](../client/src/Library.jsx#L35) | `export function Library` |
| 아이템 입력·미리보기·수정 | [client/src/Library.jsx](../client/src/Library.jsx#L179) | `Editor`, `EditForm` |
| 아이템 상세·제작 종료·생산 버튼 | [client/src/Library.jsx](../client/src/Library.jsx#L265) | `export function Detail` |
| 제작자 통계 화면 | [client/src/Info.jsx](../client/src/Info.jsx#L5) | `export function CreatorStats` |
| 인벤토리·판매·구매·거래 화면 | [client/src/Market.jsx](../client/src/Market.jsx#L112) | `Inventory`, `Market`, `Trades` |
| 메뉴와 로그인 화면 분기 | [client/src/main.jsx](../client/src/main.jsx#L113) | `privatePages`, `const nav` |
| 큰 이미지가 넘치지 않게 한 부분 | [client/src/style.css](../client/src/style.css) | `object-fit: contain`, `.detail-art`, `.mini-preview` |

## 5분 시연 순서

1. A 회원을 가입해 회원 Create, 마이페이지에서 Read를 보여줍니다. 가입 폼과 기본 골드 1,000G를 확인합니다.
2. A의 닉네임·소개를 바꿔 회원 Update를 보여줍니다.
3. A의 새 원본을 등록해 아이템 Create, 전체 도감·상세에서 Read, 설명 변경으로 Update를 보여줍니다. 생산 전에 분류·이미지도 수정할 수 있습니다.
4. 제작자별 도감에서 A를 선택해 JOIN 1을, 제작자 통계에서 A의 원본 수를 확인해 JOIN 2를 보여줍니다.
5. 다른 브라우저 또는 시크릿 창에 B로 가입해 A의 원본을 수정·삭제할 수 없음을 설명합니다. 버튼을 숨기는 것뿐 아니라 서버의 ownedItem도 권한을 검사합니다.
6. A의 상세에서 제작 종료를 실행해 아이템 Delete를 보여줍니다. 도감에서 사라지고 같은 이름은 다시 등록할 수 없습니다.
7. 마지막에 A의 비밀번호와 의사를 확인해 탈퇴하여 회원 Delete와 로그인 종료를 보여줍니다. 회원 탈퇴는 앞선 시연을 마친 후 진행하세요.

기본 시연에서 8개 CRUD와 JOIN 2개를 먼저 보여주고, 시간이 남으면 생산 10개 → 판매 6개 → B 구매 2개로 확장 기능을 설명하세요. Delete는 논리 삭제라는 점을 상태·삭제 시각·목록 변화로 함께 보여주세요.

## 제출 전 남은 확인

1. SQL 클래스룸 9문제의 제출 상태와 별도 마감을 확인합니다.
2. 현재 수정 파일과 새 파일을 포함한 완성본을 GitHub에 commit·push하고, GitHub 페이지에서 `server/reports.js`, `database/evaluation-joins.sql`, `scripts/setup.js`가 보이는지 확인합니다.
3. [저장소 URL](https://github.com/corecher/choriClass)을 수업 과제의 비공개 댓글에 제출하고 등록된 댓글을 확인합니다.
4. 학교 PC에서 저장소를 내려받아 MySQL·client·server를 실행한 뒤, 본 안내의 CRUD·JOIN 시연을 진행합니다. 실제 학교 환경은 현재 PC의 검증으로 대체할 수 없습니다.
