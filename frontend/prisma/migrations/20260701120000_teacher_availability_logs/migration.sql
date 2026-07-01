-- Histórico de alterações dos horários de disponibilidade do professor
CREATE TABLE IF NOT EXISTS `teacher_availability_logs` (
    `id` VARCHAR(191) NOT NULL,
    `teacher_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `changed_by_user_id` VARCHAR(191) NULL,
    `slots_snapshot` JSON NOT NULL,
    `students_redirected` BOOLEAN NOT NULL DEFAULT false,
    `redirected_summary` JSON NULL,

    INDEX `teacher_availability_logs_teacher_id_idx`(`teacher_id`),
    INDEX `teacher_availability_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FKs: ignorar se já existirem (ambientes que criaram a tabela manualmente)
SET @fk_teacher_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'teacher_availability_logs'
    AND CONSTRAINT_NAME = 'teacher_availability_logs_teacher_id_fkey'
);
SET @sql_teacher := IF(
  @fk_teacher_exists = 0,
  'ALTER TABLE `teacher_availability_logs` ADD CONSTRAINT `teacher_availability_logs_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_teacher FROM @sql_teacher;
EXECUTE stmt_teacher;
DEALLOCATE PREPARE stmt_teacher;

SET @fk_user_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'teacher_availability_logs'
    AND CONSTRAINT_NAME = 'teacher_availability_logs_changed_by_user_id_fkey'
);
SET @sql_user := IF(
  @fk_user_exists = 0,
  'ALTER TABLE `teacher_availability_logs` ADD CONSTRAINT `teacher_availability_logs_changed_by_user_id_fkey` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_user FROM @sql_user;
EXECUTE stmt_user;
DEALLOCATE PREPARE stmt_user;
