CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT NULL,
  action VARCHAR(64) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128) NULL,
  metadata_json JSON NULL,
  hash_basis TEXT NOT NULL,
  previous_hash CHAR(64) NULL,
  current_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_logs_actor_created (actor_user_id, created_at),
  INDEX idx_audit_logs_resource_created (resource_type, created_at),
  INDEX idx_audit_logs_action_created (action, created_at),
  UNIQUE KEY uq_audit_logs_current_hash (current_hash)
);
