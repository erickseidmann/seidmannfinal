-- CreateTable
CREATE TABLE `enrollment_payment_months` (
    `id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `payment_status` VARCHAR(191) NULL,
    `nota_fiscal_emitida` BOOLEAN NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `enrollment_payment_months_enrollment_id_year_month_key`(`enrollment_id`, `year`, `month`),
    INDEX `enrollment_payment_months_enrollment_id_idx`(`enrollment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `enrollment_payment_months` ADD CONSTRAINT `enrollment_payment_months_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
