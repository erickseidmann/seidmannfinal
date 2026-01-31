-- CreateTable: presença por aluno em aula em grupo
CREATE TABLE `lesson_record_students` (
    `id` VARCHAR(191) NOT NULL,
    `lesson_record_id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `presence` ENUM('PRESENTE', 'NAO_COMPARECEU', 'ATRASADO') NOT NULL DEFAULT 'PRESENTE',

    UNIQUE INDEX `lesson_record_students_lesson_record_id_enrollment_id_key`(`lesson_record_id`, `enrollment_id`),
    INDEX `lesson_record_students_lesson_record_id_idx`(`lesson_record_id`),
    INDEX `lesson_record_students_enrollment_id_idx`(`enrollment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lesson_record_students` ADD CONSTRAINT `lesson_record_students_lesson_record_id_fkey` FOREIGN KEY (`lesson_record_id`) REFERENCES `lesson_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_record_students` ADD CONSTRAINT `lesson_record_students_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
