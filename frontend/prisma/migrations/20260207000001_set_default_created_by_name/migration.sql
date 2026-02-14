-- Update all existing lessons that don't have created_by_name to "admin"
UPDATE `lessons` SET `created_by_name` = 'admin' WHERE `created_by_name` IS NULL;
