-- Extratos bancários por competência (upload na página Financeiro – Saídas)
CREATE TABLE `admin_bank_extratos` (
    `id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `original_filename` VARCHAR(255) NOT NULL,
    `file_url` VARCHAR(512) NOT NULL,
    `mime_type` VARCHAR(128) NULL,
    `size_bytes` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `admin_bank_extratos_year_month_idx` ON `admin_bank_extratos`(`year`, `month`);
