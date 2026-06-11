-- Comprovante de pagamento manual por mês (Financeiro – Alunos)
-- Idempotente: coluna pode já existir se aplicada manualmente ou em deploy anterior parcial.
SET @dbname = DATABASE();
SET @preparedStatement = (
  SELECT IF(
    (
      SELECT COUNT(*)
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @dbname
        AND TABLE_NAME = 'enrollment_payment_months'
        AND COLUMN_NAME = 'receipt_url'
    ) > 0,
    'SELECT 1',
    'ALTER TABLE `enrollment_payment_months` ADD COLUMN `receipt_url` TEXT NULL AFTER `paid_at`'
  )
);
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
