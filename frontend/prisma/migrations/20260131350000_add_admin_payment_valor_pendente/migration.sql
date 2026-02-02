-- AlterTable: valor pendente (aguardando aprovação do admin)
ALTER TABLE `admin_user_payment_months` ADD COLUMN `valor_pendente` DECIMAL(10, 2) NULL,
ADD COLUMN `valor_pendente_requested_at` DATETIME(3) NULL;
