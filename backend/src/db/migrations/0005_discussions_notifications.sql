CREATE TABLE IF NOT EXISTS discussions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  context_type ENUM('LISTING', 'ORDER') NOT NULL,
  context_id BIGINT NOT NULL,
  created_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_discussion_context (context_type, context_id),
  CONSTRAINT fk_discussions_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_discussions_context (context_type, context_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  discussion_id BIGINT NOT NULL,
  parent_comment_id BIGINT NULL,
  user_id BIGINT NOT NULL,
  body TEXT NOT NULL,
  quoted_comment_id BIGINT NULL,
  is_hidden TINYINT(1) NOT NULL DEFAULT 0,
  hidden_reason VARCHAR(255) NULL,
  reply_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_comments_discussion FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_comments_quote FOREIGN KEY (quoted_comment_id) REFERENCES comments(id) ON DELETE SET NULL,
  INDEX idx_comments_discussion_parent_created (discussion_id, parent_comment_id, created_at),
  INDEX idx_comments_discussion_created (discussion_id, created_at)
);

CREATE TABLE IF NOT EXISTS comment_mentions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  comment_id BIGINT NOT NULL,
  mentioned_user_id BIGINT NOT NULL,
  mention_text VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comment_mentions_comment FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_mentions_user FOREIGN KEY (mentioned_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_comment_mentions_unique (comment_id, mentioned_user_id),
  INDEX idx_comment_mentions_user (mentioned_user_id, created_at)
);

CREATE TABLE IF NOT EXISTS comment_flags (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  comment_id BIGINT NOT NULL,
  flagged_by_user_id BIGINT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comment_flags_comment FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_flags_user FOREIGN KEY (flagged_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_comment_flags_once (comment_id, flagged_by_user_id),
  INDEX idx_comment_flags_comment (comment_id, created_at)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  notification_type ENUM('MENTION', 'REPLY') NOT NULL,
  source_comment_id BIGINT NOT NULL,
  discussion_id BIGINT NOT NULL,
  message VARCHAR(255) NOT NULL,
  read_state ENUM('UNREAD', 'READ') NOT NULL DEFAULT 'UNREAD',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_comment FOREIGN KEY (source_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_discussion FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
  INDEX idx_notifications_user_created (user_id, created_at),
  INDEX idx_notifications_user_state (user_id, read_state)
);