-- CreateTable
CREATE TABLE `payment_notifications` (
    `id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `email_to` VARCHAR(255) NOT NULL,
    `success` BOOLEAN NOT NULL DEFAULT true,
    `error_message` TEXT NULL,

    UNIQUE INDEX `payment_notifications_enrollment_id_type_year_month_key`(`enrollment_id`, `type`, `year`, `month`),
    INDEX `payment_notifications_type_year_month_idx`(`type`, `year`, `month`),
    INDEX `payment_notifications_sent_at_idx`(`sent_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `payment_notifications` ADD CONSTRAINT `payment_notifications_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
