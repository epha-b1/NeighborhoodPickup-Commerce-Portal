ALTER TABLE leader_applications
  ADD COLUMN government_id_last4 VARCHAR(4) NULL AFTER experience_summary,
  ADD COLUMN certification_name VARCHAR(255) NULL AFTER government_id_last4,
  ADD COLUMN certification_issuer VARCHAR(255) NULL AFTER certification_name,
  ADD COLUMN years_of_experience INT NULL AFTER certification_issuer;
