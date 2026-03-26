CREATE TABLE `admin_dashboard_todos` (
    `id` VARCHAR(191) NOT NULL,
    `text` VARCHAR(500) NOT NULL,
    `day_key` VARCHAR(10) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `completed_by_user_id` VARCHAR(191) NULL,

    PRIMARY KEY (`id`),
    INDEX `admin_dashboard_todos_day_key_idx` (`day_key`),
    INDEX `admin_dashboard_todos_status_day_key_idx` (`status`, `day_key`),
    CONSTRAINT `admin_dashboard_todos_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `admin_dashboard_todos_completed_by_user_id_fkey` FOREIGN KEY (`completed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
