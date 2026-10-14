CREATE TABLE IF NOT EXISTS executives (
  id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL, initials VARCHAR(16) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  occurred_at VARCHAR(24) NOT NULL,
  actor_id VARCHAR(64) NULL, actor_name VARCHAR(255) NOT NULL,
  actor_role VARCHAR(16) NULL,
  action VARCHAR(64) NOT NULL,
  outcome ENUM('success','failure','denied') NOT NULL,
  entity_type VARCHAR(32) NOT NULL, entity_id VARCHAR(64) NULL,
  ip_address VARCHAR(64) NULL,
  details LONGTEXT NOT NULL CHECK(JSON_VALID(details)),
  INDEX audit_time (occurred_at), INDEX audit_action (action, id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(64) PRIMARY KEY,
  executive_id VARCHAR(64) NOT NULL,
  date DATE NOT NULL, start_min INT NOT NULL,
  duration INT NOT NULL CHECK(duration > 0),
  status ENUM('pending','confirmed','rescheduled','completed','cancelled') NOT NULL,
  data LONGTEXT NOT NULL CHECK(JSON_VALID(data)),
  FOREIGN KEY (executive_id) REFERENCES executives(id),
  INDEX appointment_schedule (executive_id, date, status)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS activity (
  sequence BIGINT UNSIGNED AUTO_INCREMENT UNIQUE,
  id VARCHAR(64) PRIMARY KEY, appointment_id VARCHAR(64) NOT NULL,
  data LONGTEXT NOT NULL CHECK(JSON_VALID(data)),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS migrations (version INT PRIMARY KEY) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS write_lock (id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO write_lock VALUES (1);
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
  role ENUM('assistant','executive','admin') NOT NULL,
  title VARCHAR(255) NOT NULL, initials VARCHAR(16) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE, is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  executive_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (executive_id) REFERENCES executives(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL,
  expires_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX session_expiry (expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id VARCHAR(64) PRIMARY KEY,
  calendar_view ENUM('day','week') NOT NULL DEFAULT 'week',
  duration INT NOT NULL DEFAULT 60,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
