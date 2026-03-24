ALTER TABLE `admin_user_payment_months` ADD COLUMN `paid_at` DATETIME(3) NULL;
ALTER TABLE `admin_user_payment_months` ADD COLUMN `receipt_url` TEXT NULL;
ALTER TABLE `admin_user_payment_months` ADD COLUMN `notification_sent_at` DATETIME(3) NULL;
