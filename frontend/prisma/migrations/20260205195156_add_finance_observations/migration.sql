-- CreateTable
CREATE TABLE `finance_observations` (
    `id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NULL,
    `teacher_id` VARCHAR(191) NULL,
    `message` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `finance_observations_enrollment_id_idx`(`enrollment_id`),
    INDEX `finance_observations_teacher_id_idx`(`teacher_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `finance_observations` ADD CONSTRAINT `finance_observations_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_observations` ADD CONSTRAINT `finance_observations_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
