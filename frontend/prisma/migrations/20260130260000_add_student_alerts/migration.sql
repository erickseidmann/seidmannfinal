-- CreateTable: alertas para alunos (como teacher_alerts para professores)
CREATE TABLE `student_alerts` (
    `id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by_id` VARCHAR(191) NULL,

    INDEX `student_alerts_enrollment_id_idx`(`enrollment_id`),
    INDEX `student_alerts_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `student_alerts` ADD CONSTRAINT `student_alerts_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_alerts` ADD CONSTRAINT `student_alerts_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
