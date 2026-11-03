CREATE TABLE IF NOT EXISTS users (
  user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  nickname VARCHAR(30) NOT NULL,
  bio VARCHAR(300) NOT NULL DEFAULT '',
  gold_balance BIGINT NOT NULL DEFAULT 1000 CHECK (gold_balance BETWEEN 0 AND 9007199254740991),
  status ENUM('ACTIVE','WITHDRAWN') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS items (
  item_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  creator_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_key VARCHAR(100) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  category ENUM('장비','의상','장식','수집품','기타') NOT NULL,
  description TEXT NOT NULL,
  image_url VARCHAR(2048) NOT NULL DEFAULT '',
  total_produced BIGINT NOT NULL DEFAULT 0 CHECK (total_produced BETWEEN 0 AND 9007199254740991),
  first_produced_at DATETIME,
  status ENUM('ACTIVE','RETIRED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  FOREIGN KEY (creator_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventories (
  user_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  quantity BIGINT NOT NULL,
  reserved_quantity BIGINT NOT NULL DEFAULT 0,
  memo TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (item_id) REFERENCES items(item_id),
  CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity AND quantity <= 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS production_logs (
  production_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  producer_id INT UNSIGNED NOT NULL,
  quantity BIGINT NOT NULL,
  request_key CHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (producer_id, request_key),
  FOREIGN KEY (producer_id) REFERENCES users(user_id),
  FOREIGN KEY (item_id) REFERENCES items(item_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS listings (
  listing_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  seller_id INT UNSIGNED NOT NULL,
  unit_price BIGINT NOT NULL,
  initial_quantity BIGINT NOT NULL,
  remaining_quantity BIGINT NOT NULL,
  status ENUM('ACTIVE','SOLD_OUT','CANCELED') NOT NULL DEFAULT 'ACTIVE',
  request_key CHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (seller_id,request_key),
  FOREIGN KEY (seller_id) REFERENCES users(user_id),
  FOREIGN KEY (item_id) REFERENCES items(item_id),
  CHECK (remaining_quantity >= 0 AND remaining_quantity <= initial_quantity)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trades (
  trade_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  buyer_id INT UNSIGNED NOT NULL,
  seller_id INT UNSIGNED NOT NULL,
  quantity BIGINT NOT NULL,
  unit_price BIGINT NOT NULL,
  total_price BIGINT NOT NULL,
  item_name_snapshot VARCHAR(100) NOT NULL,
  request_key CHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (buyer_id,request_key),
  FOREIGN KEY (listing_id) REFERENCES listings(listing_id),
  FOREIGN KEY (item_id) REFERENCES items(item_id),
  FOREIGN KEY (buyer_id) REFERENCES users(user_id),
  FOREIGN KEY (seller_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 작은 수업용 서버에서는 한 행의 잠금으로 재고·골드·탈퇴 처리 순서를 통일한다.
CREATE TABLE IF NOT EXISTS write_lock (id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO write_lock VALUES (1);
