CREATE TABLE IF NOT EXISTS appeals (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  submitted_by_user_id BIGINT NOT NULL,
  source_type ENUM('HIDDEN_CONTENT_BANNER', 'ORDER_DETAIL') NOT NULL,
  source_comment_id BIGINT NULL,
  source_order_id BIGINT NULL,
  reason_category ENUM('MODERATION', 'ORDER_ISSUE', 'FULFILLMENT', 'QUALITY', 'OTHER') NOT NULL,
  narrative TEXT NOT NULL,
  references_text VARCHAR(500) NULL,
  status ENUM('INTAKE', 'INVESTIGATION', 'RULING') NOT NULL DEFAULT 'INTAKE',
  current_event_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_appeals_user FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_appeals_comment FOREIGN KEY (source_comment_id) REFERENCES comments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_appeals_order FOREIGN KEY (source_order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT chk_appeals_source CHECK (
    (source_type = 'HIDDEN_CONTENT_BANNER' AND source_comment_id IS NOT NULL)
    OR (source_type = 'ORDER_DETAIL' AND source_order_id IS NOT NULL)
  ),
  INDEX idx_appeals_user_created (submitted_by_user_id, created_at),
  INDEX idx_appeals_status_created (status, created_at)
);

CREATE TABLE IF NOT EXISTS appeal_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  appeal_id BIGINT NOT NULL,
  from_status ENUM('INTAKE', 'INVESTIGATION', 'RULING') NULL,
  to_status ENUM('INTAKE', 'INVESTIGATION', 'RULING') NOT NULL,
  note VARCHAR(500) NOT NULL,
  changed_by_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_appeal_events_appeal FOREIGN KEY (appeal_id) REFERENCES appeals(id) ON DELETE CASCADE,
  CONSTRAINT fk_appeal_events_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_appeal_events_appeal_created (appeal_id, created_at)
);

CREATE TABLE IF NOT EXISTS appeal_files (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  appeal_id BIGINT NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  file_size_bytes INT NOT NULL,
  storage_relative_path VARCHAR(500) NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  uploaded_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_appeal_files_appeal FOREIGN KEY (appeal_id) REFERENCES appeals(id) ON DELETE CASCADE,
  CONSTRAINT fk_appeal_files_user FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_appeal_files_appeal (appeal_id, created_at)
);
