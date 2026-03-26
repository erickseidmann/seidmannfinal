-- Colunas podem já existir se a migração falhou no meio ou o banco foi ajustado manualmente.
-- Usa INFORMATION_SCHEMA para só executar ALTER quando a coluna não existe.

SET @sql = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'admin_user_payment_months'
       AND COLUMN_NAME = 'paid_at') > 0,
    'SELECT 1',
    'ALTER TABLE `admin_user_payment_months` ADD COLUMN `paid_at` DATETIME(3) NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'admin_user_payment_months'
       AND COLUMN_NAME = 'receipt_url') > 0,
    'SELECT 1',
    'ALTER TABLE `admin_user_payment_months` ADD COLUMN `receipt_url` TEXT NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'admin_user_payment_months'
       AND COLUMN_NAME = 'notification_sent_at') > 0,
    'SELECT 1',
    'ALTER TABLE `admin_user_payment_months` ADD COLUMN `notification_sent_at` DATETIME(3) NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
