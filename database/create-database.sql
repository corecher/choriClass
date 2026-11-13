-- 학교 실습실에서 MySQL 관리자 계정으로 실행할 수 있는 DB 생성 SQL이다.
-- npm run setup은 이 생성과 앱 계정 설정을 함께 처리한다. 기존 데이터는 삭제하지 않는다.
CREATE DATABASE IF NOT EXISTS chori_class_20510
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS chori_class_test_20510
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- database/schema.sql은 서버가 시작할 때 평가용 DB에 자동 적용한다.
