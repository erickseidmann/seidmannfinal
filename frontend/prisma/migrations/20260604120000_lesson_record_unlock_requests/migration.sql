-- CreateTable: lesson_record_unlock_requests (MySQL)
CREATE TABLE `lesson_record_unlock_requests` (
    `id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NOT NULL,
    `teacher_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'DENIED') NOT NULL DEFAULT 'PENDING',
    `message` TEXT NULL,
    `admin_notes` TEXT NULL,
    `processed_by_id` VARCHAR(191) NULL,
    `processed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lesson_record_unlock_requests_lesson_id_idx`(`lesson_id`),
    INDEX `lesson_record_unlock_requests_teacher_id_idx`(`teacher_id`),
    INDEX `lesson_record_unlock_requests_status_idx`(`status`),
    INDEX `lesson_record_unlock_requests_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lesson_record_unlock_requests` ADD CONSTRAINT `lesson_record_unlock_requests_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_record_unlock_requests` ADD CONSTRAINT `lesson_record_unlock_requests_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_record_unlock_requests` ADD CONSTRAINT `lesson_record_unlock_requests_processed_by_id_fkey` FOREIGN KEY (`processed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
