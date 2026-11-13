# choriClass API

기본 경로는 `/api`, 요청·응답은 JSON입니다. 로그인은 HttpOnly 쿠키를 사용합니다. 오류는 `{ "message": "안내 문구" }`로 응답합니다.

## 회원

| 메서드와 경로 | 입력 또는 결과 | 권한 |
| --- | --- | --- |
| POST `/auth/signup` | email, nickname, password → user, recoveryCode | 공개 |
| POST `/auth/login` | email, password → user | 공개 |
| POST `/auth/logout` | 현재 로그인 종료, 204 | 현재 쿠키 |
| GET `/auth/me` | user 또는 null | 현재 쿠키 |
| PATCH `/auth/me` | nickname, bio, 선택 currentPassword·newPassword → user | 본인 |
| DELETE `/auth/me` | currentPassword, confirm: true → 204 | 본인 |
| POST `/auth/reset-password` | email, recoveryCode, newPassword → 새 recoveryCode | 복구 코드 |
| POST `/auth/recovery-code` | currentPassword → 새 recoveryCode | 본인 |
| GET `/auth/export` | 본인 프로필·원본·재고·거래 | 본인 |

## 아이템과 JOIN

| 메서드와 경로 | 입력 또는 결과 | 권한 |
| --- | --- | --- |
| GET `/items` | 활성 원본과 제작자, 선택 creator=회원번호 | 공개 |
| GET `/items/:id` | 원본 상세·제작자, 제작 종료 포함 | 공개 |
| POST `/items` | name, category, description, 선택 image_url → item_id | 로그인 |
| PATCH `/items/:id` | category, description, image_url → 204 | 최초 제작자 |
| DELETE `/items/:id` | 제작 종료, 204 | 최초 제작자 |
| GET `/reports/creator-stats` | user_id, nickname, bio, item_count, total_produced, latest_item_at | 공개 |

통계의 `total_produced`는 큰 정수 정밀도를 유지하려고 문자열로 응답합니다. 분류는 장비·의상·장식·수집품·기타입니다. 이름과 제작자는 고정되며 첫 생산 후 분류·이미지도 고정됩니다.

## 생산과 거래

| 메서드와 경로 | 입력 또는 결과 | 권한 |
| --- | --- | --- |
| POST `/production` | item_id, quantity, request_key → production_id | 최초 제작자 |
| GET `/production` | 본인 생산 이력 | 본인 |
| GET `/inventory` | 본인 아이템·수량·예약·판매 가능량·메모 | 본인 |
| PATCH `/inventory/:id` | memo → ok | 보유자 |
| GET `/market` | 활성 매물, sort=price 또는 new | 공개 |
| GET `/my-listings` | 본인 모든 상태 매물 | 본인 |
| POST `/market` | item_id, quantity, unit_price, request_key → listing_id | 보유자 |
| DELETE `/market/:id` | 남은 수량 취소 → ok | 판매자 |
| POST `/market/:id/buy` | quantity, request_key → trade_id | 판매자 외 활성 회원 |
| GET `/trades` | 본인 구매·판매 기록 | 거래 당사자 |
| GET `/health` | status: ok, DB 연결 확인 | 공개 |

수량·단가는 1 이상의 안전한 정수입니다. 총액은 서버의 단가로 계산합니다. `request_key`는 UUID이며 같은 키의 다른 내용은 409입니다. 작성자·생산자·판매자·구매자 번호는 로그인 정보에서 결정합니다.

## 상태 코드

| 코드 | 의미 |
| --- | --- |
| 200 / 201 / 204 | 성공 / 생성 / 응답 내용 없는 성공 |
| 400 | 입력 형식·범위 오류 |
| 401 | 로그인 필요 또는 로그인 불일치 |
| 403 | 권한·현재 비밀번호·복구 코드 불일치, 외부 출처 |
| 404 | 없는 경로·아이템·보유 정보 |
| 409 | 중복 이름·이메일, 재고·골드 부족, 변경 불가능 상태 |
| 413 | 요청 32KB 한도 초과 |
| 429 | 인증 시도 제한, Retry-After 헤더로 대기 시간 안내 |
| 500 | 서버·DB 실패, 트랜잭션 변경 취소 |
