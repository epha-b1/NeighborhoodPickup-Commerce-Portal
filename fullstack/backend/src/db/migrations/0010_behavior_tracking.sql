CREATE TABLE IF NOT EXISTS behavior_ingestion_dedup_keys (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  idempotency_key VARCHAR(128) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  user_id BIGINT NULL,
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_behavior_dedup_key (idempotency_key),
  INDEX idx_behavior_dedup_user_seen (user_id, first_seen_at)
);

CREATE TABLE IF NOT EXISTS behavior_ingestion_queue (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  idempotency_key VARCHAR(128) NOT NULL,
  payload_json JSON NOT NULL,
  status ENUM('PENDING', 'PROCESSED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  last_error VARCHAR(255) NULL,
  available_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  INDEX idx_behavior_queue_status_available (status, available_at),
  INDEX idx_behavior_queue_created (created_at)
);

CREATE TABLE IF NOT EXISTS behavior_events_hot (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  idempotency_key VARCHAR(128) NOT NULL,
  event_type ENUM('IMPRESSION', 'CLICK', 'FAVORITE', 'VOTE', 'WATCH_COMPLETION') NOT NULL,
  user_id BIGINT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128) NULL,
  client_recorded_at TIMESTAMP NULL,
  server_recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json JSON NULL,
  CONSTRAINT fk_behavior_hot_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_behavior_hot_type_time (event_type, server_recorded_at),
  INDEX idx_behavior_hot_user_time (user_id, server_recorded_at),
  INDEX idx_behavior_hot_resource_time (resource_type, server_recorded_at)
);

CREATE TABLE IF NOT EXISTS behavior_events_archive (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  source_hot_id BIGINT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  event_type ENUM('IMPRESSION', 'CLICK', 'FAVORITE', 'VOTE', 'WATCH_COMPLETION') NOT NULL,
  user_id BIGINT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128) NULL,
  client_recorded_at TIMESTAMP NULL,
  server_recorded_at TIMESTAMP NOT NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json JSON NULL,
  INDEX idx_behavior_archive_type_time (event_type, server_recorded_at),
  INDEX idx_behavior_archive_user_time (user_id, server_recorded_at)
);
