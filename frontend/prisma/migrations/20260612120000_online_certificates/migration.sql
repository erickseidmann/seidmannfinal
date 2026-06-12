-- CreateTable
CREATE TABLE `online_certificates` (
    `id` VARCHAR(191) NOT NULL,
    `certificate_no` VARCHAR(32) NOT NULL,
    `type` ENUM('DECLARACAO', 'CONCLUSAO') NOT NULL,
    `student_name` VARCHAR(255) NOT NULL,
    `student_cpf` VARCHAR(14) NOT NULL,
    `course_title` VARCHAR(500) NOT NULL,
    `course_body` TEXT NOT NULL,
    `period_start` DATETIME(3) NULL,
    `period_end` DATETIME(3) NULL,
    `total_hours` INTEGER NOT NULL,
    `issue_date` DATE NOT NULL,
    `pdf_path` VARCHAR(500) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `online_certificates_certificate_no_key`(`certificate_no`),
    INDEX `online_certificates_active_idx`(`active`),
    INDEX `online_certificates_created_by_id_idx`(`created_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `online_certificates` ADD CONSTRAINT `online_certificates_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
