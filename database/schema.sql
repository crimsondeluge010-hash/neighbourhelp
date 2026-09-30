CREATE DATABASE IF NOT EXISTS neighbourhelp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE neighbourhelp;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  firebase_uid VARCHAR(128) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(320) NOT NULL UNIQUE,
  phone VARCHAR(32) NULL,
  profile_photo VARCHAR(500) NULL,
  address VARCHAR(255) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  bio TEXT NULL,
  skills VARCHAR(500) NULL,
  availability VARCHAR(120) NULL,
  is_helper TINYINT(1) NOT NULL DEFAULT 0,
  is_requester TINYINT(1) NOT NULL DEFAULT 1,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  verification_status ENUM('Verified','Pending Verification','Not Verified') NOT NULL DEFAULT 'Not Verified',
  is_disabled TINYINT(1) NOT NULL DEFAULT 0,
  completed_tasks INT NOT NULL DEFAULT 0,
  average_rating DECIMAL(3,2) NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_location (latitude, longitude),
  INDEX idx_users_helper (is_helper, is_disabled)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS help_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requester_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL,
  location VARCHAR(255) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  preferred_date DATE NULL,
  preferred_time VARCHAR(80) NULL,
  budget_min DECIMAL(10,2) NOT NULL DEFAULT 0,
  budget_max DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('Open','Accepted','In Progress','Completed','Cancelled') NOT NULL DEFAULT 'Open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_requests_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_requests_status (status),
  INDEX idx_requests_category (category),
  INDEX idx_requests_location (latitude, longitude)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL UNIQUE,
  requester_id INT NOT NULL,
  helper_id INT NOT NULL,
  accepted_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  status ENUM('Accepted','In Progress','Completed','Cancelled') NOT NULL DEFAULT 'Accepted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tasks_request FOREIGN KEY (request_id) REFERENCES help_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_helper FOREIGN KEY (helper_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_tasks_requester (requester_id),
  INDEX idx_tasks_helper (helper_id),
  INDEX idx_tasks_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  reviewer_id INT NOT NULL,
  reviewed_user_id INT NOT NULL,
  rating TINYINT NOT NULL,
  review TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_ratings_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_reviewed FOREIGN KEY (reviewed_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_task_reviewer (task_id, reviewer_id),
  INDEX idx_ratings_reviewed (reviewed_user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS verification_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  verification_type VARCHAR(120) NOT NULL,
  document_reference VARCHAR(500) NULL,
  status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
  admin_notes TEXT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  CONSTRAINT fk_verification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_verification_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  sender_id INT NOT NULL,
  recipient_id INT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  CONSTRAINT fk_messages_request FOREIGN KEY (request_id) REFERENCES help_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_messages_recipient (recipient_id, read_at),
  INDEX idx_messages_request (request_id, created_at)
) ENGINE=InnoDB;
