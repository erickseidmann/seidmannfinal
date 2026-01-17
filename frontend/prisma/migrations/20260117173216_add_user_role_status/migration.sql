/*
  Warnings:

  - A unique constraint covering the columns `[tracking_code]` on the table `enrollments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `enrollments` ADD COLUMN `contract_accepted_at` DATETIME(3) NULL,
    ADD COLUMN `contract_version` VARCHAR(191) NULL,
    ADD COLUMN `tracking_code` VARCHAR(191) NULL,
    MODIFY `idioma` ENUM('ENGLISH', 'SPANISH') NULL,
    MODIFY `nivel` VARCHAR(191) NULL,
    MODIFY `status` ENUM('LEAD', 'REGISTERED', 'CONTRACT_ACCEPTED', 'PAYMENT_PENDING', 'ACTIVE', 'BLOCKED', 'COMPLETED') NOT NULL DEFAULT 'LEAD';

-- AlterTable
ALTER TABLE `payment_info` ADD COLUMN `due_date` DATETIME(3) NULL,
    ADD COLUMN `due_day` INTEGER NULL,
    ADD COLUMN `monthly_value` DECIMAL(10, 2) NULL,
    ADD COLUMN `paid_at` DATETIME(3) NULL,
    ADD COLUMN `payment_status` VARCHAR(191) NULL,
    ADD COLUMN `plan` VARCHAR(191) NULL,
    ADD COLUMN `reminder_enabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `transaction_ref` VARCHAR(191) NULL,
    MODIFY `valor_mensal` DECIMAL(10, 2) NULL,
    MODIFY `data_pagamento` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `role` ENUM('STUDENT', 'TEACHER', 'ADMIN') NOT NULL DEFAULT 'STUDENT',
    ADD COLUMN `status` ENUM('PENDING', 'ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX `enrollments_tracking_code_key` ON `enrollments`(`tracking_code`);

-- CreateIndex
CREATE INDEX `enrollments_tracking_code_idx` ON `enrollments`(`tracking_code`);

-- CreateIndex
CREATE INDEX `users_role_idx` ON `users`(`role`);

-- CreateIndex
CREATE INDEX `users_status_idx` ON `users`(`status`);
