CREATE TABLE IF NOT EXISTS pickup_points (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  address_line1 VARCHAR(150) NOT NULL,
  address_line2 VARCHAR(150) NULL,
  city VARCHAR(80) NOT NULL,
  state_region VARCHAR(80) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  business_hours_json JSON NOT NULL,
  daily_capacity INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pickup_points_active (is_active)
);

CREATE TABLE IF NOT EXISTS pickup_windows (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  pickup_point_id BIGINT NOT NULL,
  window_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  capacity_total INT NOT NULL,
  reserved_slots INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pickup_windows_point FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id) ON DELETE CASCADE,
  INDEX idx_pickup_windows_point_date (pickup_point_id, window_date)
);

CREATE TABLE IF NOT EXISTS pickup_capacity_snapshots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  pickup_window_id BIGINT NOT NULL,
  capacity_total INT NOT NULL,
  capacity_reserved INT NOT NULL,
  snapshot_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_capacity_snapshots_window FOREIGN KEY (pickup_window_id) REFERENCES pickup_windows(id) ON DELETE CASCADE,
  INDEX idx_capacity_snapshots_window_time (pickup_window_id, snapshot_at)
);

CREATE TABLE IF NOT EXISTS buying_cycles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  status ENUM('DRAFT', 'ACTIVE', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_buying_cycles_status_dates (status, starts_at, ends_at)
);

CREATE TABLE IF NOT EXISTS listings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  cycle_id BIGINT NOT NULL,
  pickup_point_id BIGINT NOT NULL,
  leader_user_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  unit_label VARCHAR(40) NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_listings_cycle FOREIGN KEY (cycle_id) REFERENCES buying_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_listings_pickup_point FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id) ON DELETE CASCADE,
  CONSTRAINT fk_listings_leader FOREIGN KEY (leader_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_listings_cycle_status (cycle_id, status),
  INDEX idx_listings_pickup_point (pickup_point_id),
  INDEX idx_listings_leader (leader_user_id)
);

CREATE TABLE IF NOT EXISTS listing_inventory (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  listing_id BIGINT NOT NULL,
  available_quantity INT NOT NULL,
  reserved_quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_listing_inventory_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  UNIQUE KEY uq_listing_inventory_listing (listing_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  pickup_point_id BIGINT NULL,
  leader_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_favorites_pickup_point FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id) ON DELETE CASCADE,
  CONSTRAINT fk_favorites_leader FOREIGN KEY (leader_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_favorites_target CHECK (
    (pickup_point_id IS NOT NULL AND leader_user_id IS NULL) OR
    (pickup_point_id IS NULL AND leader_user_id IS NOT NULL)
  ),
  UNIQUE KEY uq_favorites_pickup_point (user_id, pickup_point_id),
  UNIQUE KEY uq_favorites_leader (user_id, leader_user_id),
  INDEX idx_favorites_user (user_id)
);