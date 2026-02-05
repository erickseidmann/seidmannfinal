-- CreateTable
CREATE TABLE `teacher_requests` (
    `id` VARCHAR(191) NOT NULL,
    `horarios` TEXT NOT NULL,
    `idiomas` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
