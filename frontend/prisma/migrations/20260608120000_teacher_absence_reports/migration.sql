-- CreateTable
CREATE TABLE `teacher_absence_reports` (
    `id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `teacher_id` VARCHAR(191) NOT NULL,
    `report_type` ENUM('ABSENT', 'LATE') NOT NULL,
    `status` ENUM('OPEN', 'VERIFYING', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
    `todo_id` VARCHAR(191) NULL,
    `verifying_by_user_id` VARCHAR(191) NULL,
    `resolved_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `teacher_absence_reports_todo_id_key`(`todo_id`),
    INDEX `teacher_absence_reports_status_idx`(`status`),
    INDEX `teacher_absence_reports_lesson_id_idx`(`lesson_id`),
    INDEX `teacher_absence_reports_teacher_id_idx`(`teacher_id`),
    UNIQUE INDEX `teacher_absence_reports_lesson_id_enrollment_id_report_type_key`(`lesson_id`, `enrollment_id`, `report_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `teacher_absence_reports` ADD CONSTRAINT `teacher_absence_reports_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_absence_reports` ADD CONSTRAINT `teacher_absence_reports_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_absence_reports` ADD CONSTRAINT `teacher_absence_reports_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_absence_reports` ADD CONSTRAINT `teacher_absence_reports_todo_id_fkey` FOREIGN KEY (`todo_id`) REFERENCES `admin_dashboard_todos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_absence_reports` ADD CONSTRAINT `teacher_absence_reports_verifying_by_user_id_fkey` FOREIGN KEY (`verifying_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_absence_reports` ADD CONSTRAINT `teacher_absence_reports_resolved_by_user_id_fkey` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
