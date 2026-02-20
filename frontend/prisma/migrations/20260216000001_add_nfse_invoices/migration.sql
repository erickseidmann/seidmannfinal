-- CreateTable
CREATE TABLE `nfse_invoices` (
    `id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `student_name` VARCHAR(255) NOT NULL,
    `cpf` VARCHAR(14) NOT NULL,
    `email` VARCHAR(255) NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `focus_ref` VARCHAR(255) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'processando_autorizacao',
    `numero` VARCHAR(50) NULL,
    `codigo_verificacao` VARCHAR(100) NULL,
    `pdf_url` TEXT NULL,
    `xml_url` TEXT NULL,
    `error_message` TEXT NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancel_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `nfse_invoices_focus_ref_key`(`focus_ref`),
    UNIQUE INDEX `nfse_invoices_enrollment_id_year_month_key`(`enrollment_id`, `year`, `month`),
    INDEX `idx_nfse_status`(`status`),
    INDEX `idx_nfse_year_month`(`year`, `month`),
    INDEX `idx_nfse_created`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `nfse_invoices` ADD CONSTRAINT `nfse_invoices_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
