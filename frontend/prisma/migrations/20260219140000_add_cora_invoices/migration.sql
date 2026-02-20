-- CreateTable
CREATE TABLE `cora_invoices` (
    `id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `cora_invoice_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `amount` INTEGER NOT NULL,
    `due_date` DATETIME(3) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `digitable_line` TEXT NULL,
    `bar_code` TEXT NULL,
    `pix_qr_code` TEXT NULL,
    `pix_copy_paste` TEXT NULL,
    `boleto_url` TEXT NULL,
    `paid_at` DATETIME(3) NULL,
    `paid_amount` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cora_invoices_cora_invoice_id_key`(`cora_invoice_id`),
    UNIQUE INDEX `cora_invoices_code_key`(`code`),
    UNIQUE INDEX `cora_invoices_enrollment_id_year_month_key`(`enrollment_id`, `year`, `month`),
    INDEX `cora_invoices_status_idx`(`status`),
    INDEX `cora_invoices_cora_invoice_id_idx`(`cora_invoice_id`),
    INDEX `cora_invoices_due_date_idx`(`due_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cora_webhook_events` (
    `id` VARCHAR(191) NOT NULL,
    `event_id` VARCHAR(100) NOT NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `cora_webhook_events_event_id_key`(`event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `cora_invoices` ADD CONSTRAINT `cora_invoices_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
