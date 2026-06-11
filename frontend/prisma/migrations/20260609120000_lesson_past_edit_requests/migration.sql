-- AlterTable
ALTER TABLE `users` ADD COLUMN `can_approve_late_lesson_edits` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `lesson_past_edit_requests` (
    `id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NOT NULL,
    `requested_by_user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `payload` JSON NOT NULL,
    `processed_by_user_id` VARCHAR(191) NULL,
    `processed_at` DATETIME(3) NULL,
    `rejection_note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lesson_past_edit_requests_lesson_id_idx`(`lesson_id`),
    INDEX `lesson_past_edit_requests_status_idx`(`status`),
    INDEX `lesson_past_edit_requests_requested_by_user_id_idx`(`requested_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lesson_past_edit_requests` ADD CONSTRAINT `lesson_past_edit_requests_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_past_edit_requests` ADD CONSTRAINT `lesson_past_edit_requests_requested_by_user_id_fkey` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_past_edit_requests` ADD CONSTRAINT `lesson_past_edit_requests_processed_by_user_id_fkey` FOREIGN KEY (`processed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
