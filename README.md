# 취향창고 · choriClass

React, Node.js, MySQL로 만든 디지털 아이템 수집 서비스입니다. 첫 화면은 회원가입입니다. 이메일, 닉네임, 비밀번호를 입력하면 개인 창고가 열리고 1,000G가 지급됩니다.

## 이 컴퓨터에서 실행하기

프로젝트 폴더에서 PowerShell을 두 개 엽니다. 첫 번째 창에서 프로젝트 전용 MySQL을 실행합니다. 기존 회원과 아이템은 다시 실행해도 유지됩니다.

```powershell
npm.cmd run db:start
```

두 번째 창에서 웹 앱을 시작하고 브라우저로 [취향창고 회원가입](http://127.0.0.1:3000/#/signup)을 엽니다.

```powershell
npm.cmd run dev
```

이 컴퓨터의 MySQL은 33317번 포트를 사용합니다. 실행 파일과 데이터는 프로젝트의 `.local`에 있고 앱 계정의 연결 설정은 `.env`에 있습니다. 둘 다 버전 관리에서 제외됩니다. 웹 앱과 DB는 이 컴퓨터에서만 접속할 수 있습니다. 실행한 터미널에서 Ctrl+C를 누르면 해당 프로세스를 종료할 수 있습니다.

## 다른 컴퓨터에서 설정하기

1. Node.js 22.12 이상과 MySQL 8.4를 준비하고 MySQL을 시작합니다.
2. MySQL 관리자 계정으로 아래 SQL을 실행합니다. 예시 비밀번호는 자신의 로컬 비밀번호로 바꾸세요.
3. `.env.example`을 `.env`로 복사하고 포트와 비밀번호를 입력합니다.
4. `npm ci`와 `npm run dev`를 순서대로 실행합니다. 첫 시작 때 필요한 테이블을 생성합니다. 빌드된 화면을 사용하려면 `npm run build` 후 `npm start`를 실행합니다.

```sql
CREATE DATABASE chori_class CHARACTER SET utf8mb4;
CREATE USER 'chori'@'localhost' IDENTIFIED BY 'replace-with-your-local-password';
GRANT ALL PRIVILEGES ON chori_class.* TO 'chori'@'localhost';
```

## 회원가입 코드 따라가기

| 단계 | 위치 | 하는 일 |
| --- | --- | --- |
| 입력 | `client/src/Auth.jsx` | 이메일, 닉네임, 비밀번호와 확인 값을 받아 가입을 요청합니다. |
| 서버 검증 | `server/validation.js` | 이메일 형식과 비밀번호 길이를 검사합니다. bcrypt 입력의 최대 길이는 UTF-8 기준 72바이트입니다. |
| 저장 | `server/auth.js` | bcrypt 해시를 만든 뒤 회원과 로그인을 같은 트랜잭션에서 저장합니다. 브라우저에는 HttpOnly 쿠키를 발급합니다. |
| 중복 방지 | `database/schema.sql` | 이메일 UNIQUE 제약을 적용하고 새 회원 행의 골드 기본값을 1000으로 설정합니다. 동시에 가입해도 한 건만 성공합니다. |

## 직접 시연하기

1. A 계정으로 가입해 **마이페이지**에서 1,000G를 확인합니다. **내 제작소 → 원본 등록**에서 이름, 분류, 설명을 입력합니다. 원본 상세에서 10개를 생산합니다.
2. **내 인벤토리**에서 6개를 개당 100G에 판매 등록합니다. 보유 수량은 10개, 예약은 6개, 추가 판매 가능 수량은 4개입니다.
3. 다른 브라우저나 시크릿 창에서 B 계정으로 가입합니다. **시장**에서 2개를 구매합니다. A에게는 1,200G와 아이템 8개, B에게는 800G와 아이템 2개가 남습니다. B는 보유분을 다시 판매할 수 있습니다.
4. A가 닉네임과 소개를 바꾸고 **제작자별 도감**에서 변경을 확인합니다. `items.creator_id = users.user_id`로 두 테이블을 연결하므로 최신 공개 프로필이 표시됩니다. B는 A의 원본을 수정하거나 생산할 수 없습니다.
5. A가 원본을 삭제하면 제작이 종료됩니다. 일반 도감에서 숨겨지고 같은 이름은 재사용할 수 없습니다. B의 보유분은 유지됩니다. A가 탈퇴하면 로그인은 종료되고 남은 매물은 취소됩니다.

## 통합 테스트

테스트는 별도 MySQL 데이터베이스에 임의의 테스트 계정을 생성합니다. 이 컴퓨터에는 테스트 DB가 준비되어 있습니다. 다른 컴퓨터에서는 아래 SQL로 준비한 뒤 `npm test`를 실행하세요.

```sql
CREATE DATABASE chori_class_test CHARACTER SET utf8mb4;
GRANT ALL PRIVILEGES ON chori_class_test.* TO 'chori'@'localhost';
```

검증 항목은 동시 가입과 비밀번호 해시, 초기 골드, 로그인·로그아웃·탈퇴, 작성자 권한, 제작자 JOIN, 중복 생산과 구매, 마지막 매물 동시 구매, 골드 부족 시 재고 유지, 탈퇴한 제작자의 아이템 재판매입니다. 골드와 수량을 함께 변경하는 순서는 `server/economy.js`에서 확인할 수 있습니다.
