CREATE TABLE IF NOT EXISTS withdrawal_blacklist (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_withdrawal_blacklist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_withdrawal_blacklist_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_withdrawal_blacklist_user (user_id),
  INDEX idx_withdrawal_blacklist_active (active)
);

CREATE TABLE IF NOT EXISTS finance_withdrawals (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  leader_user_id BIGINT NOT NULL,
  requested_amount DECIMAL(12,2) NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL,
  decided_by_user_id BIGINT NULL,
  decision_note VARCHAR(255) NULL,
  CONSTRAINT fk_finance_withdrawals_leader FOREIGN KEY (leader_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_withdrawals_decided_by FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_finance_withdrawals_leader_requested (leader_user_id, requested_at),
  INDEX idx_finance_withdrawals_status_requested (status, requested_at)
);

CREATE TABLE IF NOT EXISTS withdrawal_limits_tracking (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  leader_user_id BIGINT NOT NULL,
  window_date DATE NOT NULL,
  approved_daily_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  approved_week_count INT NOT NULL DEFAULT 0,
  week_start_date DATE NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_withdrawal_limits_tracking_leader FOREIGN KEY (leader_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_withdrawal_limits_tracking (leader_user_id, window_date),
  INDEX idx_withdrawal_limits_week (leader_user_id, week_start_date)
);

CREATE TABLE IF NOT EXISTS reconciliation_export_jobs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  requested_by_user_id BIGINT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  generated_file_name VARCHAR(255) NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reconciliation_export_jobs_user FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_reconciliation_export_jobs_date (date_from, date_to, generated_at)
);
