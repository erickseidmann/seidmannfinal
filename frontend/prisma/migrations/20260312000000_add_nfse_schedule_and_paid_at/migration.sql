-- AddColumn paid_at to enrollment_payment_months
ALTER TABLE `enrollment_payment_months` ADD COLUMN `paid_at` DATETIME(3) NULL;

-- CreateTable nfse_schedules
CREATE TABLE `nfse_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `faturamento_tipo` VARCHAR(20) NOT NULL,
    `empresa_razao_social` VARCHAR(255) NULL,
    `empresa_cnpj` VARCHAR(20) NULL,
    `empresa_endereco_fiscal` TEXT NULL,
    `empresa_descricao_nfse` TEXT NULL,
    `email_body` TEXT NULL,
    `scheduled_for` DATETIME(3) NOT NULL,
    `repeat_monthly` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `nfse_schedules_enrollment_id_year_month_key`(`enrollment_id`, `year`, `month`),
    INDEX `nfse_schedules_scheduled_for_idx`(`scheduled_for`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `nfse_schedules` ADD CONSTRAINT `nfse_schedules_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
