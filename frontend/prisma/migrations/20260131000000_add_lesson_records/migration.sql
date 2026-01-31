-- CreateEnum (RecordPresence)
-- CreateEnum (RecordLessonType)
-- CreateEnum (RecordHomeworkDone)
-- CreateTable: registros de aula
CREATE TABLE `lesson_records` (
    `id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NOT NULL,
    `status` ENUM('CONFIRMED', 'CANCELLED', 'REPOSICAO') NOT NULL DEFAULT 'CONFIRMED',
    `presence` ENUM('PRESENTE', 'NAO_COMPARECEU', 'ATRASADO') NOT NULL DEFAULT 'PRESENTE',
    `lesson_type` ENUM('NORMAL', 'CONVERSAÇÃO', 'REVISAO', 'AVALIACAO') NOT NULL DEFAULT 'NORMAL',
    `book` VARCHAR(255) NULL,
    `last_page` VARCHAR(100) NULL,
    `assigned_homework` TEXT NULL,
    `homework_done` ENUM('SIM', 'NAO', 'PARCIAL', 'NAO_APLICA') NULL,
    `grade_grammar` DOUBLE NULL,
    `grade_speaking` DOUBLE NULL,
    `grade_listening` DOUBLE NULL,
    `grade_understanding` DOUBLE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lesson_records_lesson_id_key`(`lesson_id`),
    INDEX `lesson_records_lesson_id_idx`(`lesson_id`),
    INDEX `lesson_records_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lesson_records` ADD CONSTRAINT `lesson_records_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
