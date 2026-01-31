-- CreateEnum (LessonStatus)
-- CreateTable: aulas no calendário (aluno + professor + status + data/hora)
CREATE TABLE `lessons` (
    `id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `teacher_id` VARCHAR(191) NOT NULL,
    `status` ENUM('CONFIRMED', 'CANCELLED', 'REPOSICAO') NOT NULL DEFAULT 'CONFIRMED',
    `start_at` DATETIME(3) NOT NULL,
    `duration_minutes` INTEGER NOT NULL DEFAULT 60,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lessons_start_at_idx`(`start_at`),
    INDEX `lessons_enrollment_id_idx`(`enrollment_id`),
    INDEX `lessons_teacher_id_idx`(`teacher_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
