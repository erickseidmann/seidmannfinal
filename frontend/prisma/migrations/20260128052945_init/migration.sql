-- AlterTable
ALTER TABLE `users` MODIFY `status` ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED') NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE `teachers` (
    `id` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `whatsapp` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED') NOT NULL DEFAULT 'ACTIVE',
    `user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `teachers_email_key`(`email`),
    UNIQUE INDEX `teachers_user_id_key`(`user_id`),
    INDEX `teachers_email_idx`(`email`),
    INDEX `teachers_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendances` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('STUDENT', 'TEACHER') NOT NULL,
    `status` ENUM('PRESENT', 'ABSENT') NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `teacher_id` VARCHAR(191) NULL,
    `date` DATETIME(3) NOT NULL,
    `notes` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendances_type_date_idx`(`type`, `date`),
    INDEX `attendances_user_id_date_idx`(`user_id`, `date`),
    INDEX `attendances_teacher_id_date_idx`(`teacher_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `book_releases` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `bookCode` VARCHAR(191) NOT NULL,
    `released_by_admin_email` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `book_releases_user_id_idx`(`user_id`),
    INDEX `book_releases_bookCode_idx`(`bookCode`),
    UNIQUE INDEX `book_releases_user_id_bookCode_key`(`user_id`, `bookCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `channel` ENUM('EMAIL', 'SMS') NOT NULL,
    `audience` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `created_by_admin_email` VARCHAR(191) NOT NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `announcements_status_idx`(`status`),
    INDEX `announcements_channel_idx`(`channel`),
    INDEX `announcements_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teacher_alerts` (
    `id` VARCHAR(191) NOT NULL,
    `teacher_id` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `teacher_alerts_teacher_id_idx`(`teacher_id`),
    INDEX `teacher_alerts_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `teachers` ADD CONSTRAINT `teachers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `book_releases` ADD CONSTRAINT `book_releases_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_alerts` ADD CONSTRAINT `teacher_alerts_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
