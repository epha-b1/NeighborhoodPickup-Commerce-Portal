CREATE TABLE IF NOT EXISTS tax_jurisdictions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  tax_rate DECIMAL(8,6) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  rule_type ENUM('TIERED_DISCOUNT', 'CAPPED_DISCOUNT', 'MEMBER_PRICING', 'SUBSIDY') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  applies_scope ENUM('GLOBAL', 'LISTING', 'PICKUP_POINT') NOT NULL DEFAULT 'GLOBAL',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pricing_rule_versions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  pricing_rule_id BIGINT NOT NULL,
  version_no INT NOT NULL,
  config_json JSON NOT NULL,
  effective_from DATETIME NOT NULL,
  effective_to DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pricing_rule_versions_rule FOREIGN KEY (pricing_rule_id) REFERENCES pricing_rules(id) ON DELETE CASCADE,
  UNIQUE KEY uq_pricing_rule_versions (pricing_rule_id, version_no),
  INDEX idx_pricing_rule_versions_effective (pricing_rule_id, effective_from, effective_to)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  cycle_id BIGINT NOT NULL,
  pickup_point_id BIGINT NOT NULL,
  status ENUM('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  tax_jurisdiction_id BIGINT NOT NULL,
  subtotal_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  subsidy_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  pricing_trace_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_cycle FOREIGN KEY (cycle_id) REFERENCES buying_cycles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_pickup_point FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_tax_jurisdiction FOREIGN KEY (tax_jurisdiction_id) REFERENCES tax_jurisdictions(id) ON DELETE RESTRICT,
  INDEX idx_orders_user_created (user_id, created_at),
  INDEX idx_orders_status (status)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  listing_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_subtotal DECIMAL(12,2) NOT NULL,
  line_discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_subsidy DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  pricing_breakdown_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE RESTRICT,
  INDEX idx_order_items_order (order_id)
);

CREATE TABLE IF NOT EXISTS order_pickup_window (
  order_id BIGINT PRIMARY KEY,
  pickup_window_id BIGINT NOT NULL,
  selected_date DATE NOT NULL,
  selected_start_time TIME NOT NULL,
  selected_end_time TIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_pickup_window_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_pickup_window_window FOREIGN KEY (pickup_window_id) REFERENCES pickup_windows(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  changed_by_user_id BIGINT NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_status_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_status_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_order_status_history_order (order_id, created_at)
);

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  account_type ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settlements (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  status ENUM('PENDING', 'POSTED', 'REVERSED') NOT NULL DEFAULT 'PENDING',
  settled_amount DECIMAL(12,2) NOT NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  posted_at TIMESTAMP NULL,
  CONSTRAINT fk_settlements_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_settlements_order (order_id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  settlement_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  direction ENUM('DEBIT', 'CREDIT') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  memo VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ledger_entries_settlement FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE,
  CONSTRAINT fk_ledger_entries_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ledger_entries_account FOREIGN KEY (account_id) REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  INDEX idx_ledger_entries_order (order_id),
  INDEX idx_ledger_entries_account_date (account_id, created_at)
);