CREATE TABLE IF NOT EXISTS leaders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  pickup_point_id BIGINT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'PENDING',
  commission_eligible TINYINT(1) NOT NULL DEFAULT 0,
  default_commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0600,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_leaders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_leaders_pickup_point FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id) ON DELETE SET NULL,
  UNIQUE KEY uq_leaders_user (user_id),
  INDEX idx_leaders_status (status)
);

CREATE TABLE IF NOT EXISTS leader_applications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  experience_summary TEXT NOT NULL,
  pickup_point_id BIGINT NULL,
  requested_commission_eligible TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_leader_applications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_leader_applications_pickup_point FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id) ON DELETE SET NULL,
  INDEX idx_leader_applications_user (user_id, submitted_at),
  INDEX idx_leader_applications_status (status, submitted_at)
);

CREATE TABLE IF NOT EXISTS leader_approvals (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  leader_application_id BIGINT NOT NULL,
  admin_user_id BIGINT NOT NULL,
  decision ENUM('APPROVED', 'REJECTED') NOT NULL,
  reason VARCHAR(255) NOT NULL,
  commission_eligible TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_leader_approvals_application FOREIGN KEY (leader_application_id) REFERENCES leader_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_leader_approvals_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_leader_approvals_application (leader_application_id, created_at)
);

CREATE TABLE IF NOT EXISTS leader_commission_rules (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  leader_id BIGINT NOT NULL,
  pickup_point_id BIGINT NULL,
  commission_rate DECIMAL(5,4) NOT NULL,
  effective_from DATETIME NOT NULL,
  effective_to DATETIME NULL,
  created_by_user_id BIGINT NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_leader_commission_rules_leader FOREIGN KEY (leader_id) REFERENCES leaders(id) ON DELETE CASCADE,
  CONSTRAINT fk_leader_commission_rules_pickup_point FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id) ON DELETE SET NULL,
  CONSTRAINT fk_leader_commission_rules_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_leader_commission_rules_leader_dates (leader_id, effective_from, effective_to)
);

CREATE TABLE IF NOT EXISTS leader_metrics_daily (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  leader_id BIGINT NOT NULL,
  metric_date DATE NOT NULL,
  order_volume INT NOT NULL DEFAULT 0,
  fulfilled_orders INT NOT NULL DEFAULT 0,
  feedback_score_avg DECIMAL(4,2) NULL,
  feedback_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_leader_metrics_daily_leader FOREIGN KEY (leader_id) REFERENCES leaders(id) ON DELETE CASCADE,
  UNIQUE KEY uq_leader_metrics_daily (leader_id, metric_date),
  INDEX idx_leader_metrics_daily_date (metric_date)
);
