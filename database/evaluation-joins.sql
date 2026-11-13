-- 결과 1: 제작자별 아이템 도감. 정확히 users와 items 두 테이블을 JOIN한다.
-- 화면: 상단 '제작자별 도감' / API: GET /api/items?creator=회원번호
SELECT u.user_id, u.nickname, u.bio,
       i.item_id, i.name, i.category, i.total_produced
FROM users AS u
JOIN items AS i ON i.creator_id = u.user_id
WHERE u.status = 'ACTIVE' AND i.status = 'ACTIVE'
ORDER BY i.created_at DESC, i.item_id DESC;

-- 결과 2: 제작자별 원본 수와 생산량 통계. 같은 두 테이블의 다른 조회 결과다.
-- 화면: 상단 '제작자 통계' / API: GET /api/reports/creator-stats
-- 원본이 없는 회원도 보여주려고 LEFT JOIN하고, 회원별로 묶어서 집계한다.
SELECT u.user_id, u.nickname, u.bio,
       COUNT(i.item_id) AS item_count,
       COALESCE(SUM(i.total_produced), 0) AS total_produced,
       MAX(i.created_at) AS latest_item_at
FROM users AS u
LEFT JOIN items AS i ON i.creator_id = u.user_id AND i.status = 'ACTIVE'
WHERE u.status = 'ACTIVE'
GROUP BY u.user_id, u.nickname, u.bio
ORDER BY item_count DESC, u.user_id ASC;
