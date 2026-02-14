-- CreateEnum: LessonRequestType
-- MySQL não suporta ENUM nativo como PostgreSQL, então usamos VARCHAR com constraint
-- Os valores válidos são: CANCELAMENTO, TROCA_PROFESSOR, TROCA_AULA

-- CreateEnum: LessonRequestStatus
-- Os valores válidos são: PENDING, TEACHER_APPROVED, TEACHER_REJECTED, ADMIN_APPROVED, ADMIN_REJECTED, COMPLETED

-- CreateTable: lesson_requests
CREATE TABLE IF NOT EXISTS `lesson_requests` (
  `id` VARCHAR(191) NOT NULL,
  `lesson_id` VARCHAR(191) NOT NULL,
  `enrollment_id` VARCHAR(191) NOT NULL,
  `teacher_id` VARCHAR(191) NOT NULL,
  `type` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `requires_teacher_approval` BOOLEAN NOT NULL DEFAULT false,
  `teacher_approval` VARCHAR(20) NULL,
  `teacher_approved_at` DATETIME(3) NULL,
  `requested_start_at` DATETIME(3) NULL,
  `requested_teacher_id` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `admin_notes` TEXT NULL,
  `created_by_id` VARCHAR(191) NULL,
  `processed_by_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `lesson_requests_lesson_id_idx`(`lesson_id`),
  INDEX `lesson_requests_enrollment_id_idx`(`enrollment_id`),
  INDEX `lesson_requests_teacher_id_idx`(`teacher_id`),
  INDEX `lesson_requests_requested_teacher_id_idx`(`requested_teacher_id`),
  INDEX `lesson_requests_status_idx`(`status`),
  INDEX `lesson_requests_created_by_id_idx`(`created_by_id`),
  INDEX `lesson_requests_type_idx`(`type`),
  INDEX `lesson_requests_requires_teacher_approval_idx`(`requires_teacher_approval`),
  INDEX `lesson_requests_teacher_approval_idx`(`teacher_approval`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lesson_requests` ADD CONSTRAINT `lesson_requests_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_requests` ADD CONSTRAINT `lesson_requests_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_requests` ADD CONSTRAINT `lesson_requests_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_requests` ADD CONSTRAINT `lesson_requests_requested_teacher_id_fkey` FOREIGN KEY (`requested_teacher_id`) REFERENCES `teachers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_requests` ADD CONSTRAINT `lesson_requests_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_requests` ADD CONSTRAINT `lesson_requests_processed_by_id_fkey` FOREIGN KEY (`processed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
