-- Despesa fixa: série para repetir todo mês; comprovante e data ao pagar
ALTER TABLE `admin_expenses` ADD COLUMN `fixed_series_id` VARCHAR(191) NULL;
ALTER TABLE `admin_expenses` ADD COLUMN `paid_at` DATETIME(3) NULL;
ALTER TABLE `admin_expenses` ADD COLUMN `receipt_url` TEXT NULL;
CREATE INDEX `admin_expenses_fixed_series_id_idx` ON `admin_expenses`(`fixed_series_id`);
