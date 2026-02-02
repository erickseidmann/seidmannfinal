-- CreateTable
CREATE TABLE `teacher_payment_months` (
    `id` VARCHAR(191) NOT NULL,
    `teacher_id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `payment_status` VARCHAR(191) NULL,
    `valor_por_periodo` DECIMAL(10, 2) NULL,
    `valor_extra` DECIMAL(10, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `teacher_payment_months_teacher_id_year_month_key`(`teacher_id`, `year`, `month`),
    INDEX `teacher_payment_months_teacher_id_idx`(`teacher_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `teacher_payment_months` ADD CONSTRAINT `teacher_payment_months_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
