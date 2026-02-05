-- AlterTable: student_alerts - add read_at (notificações lidas há mais de 2 dias não são exibidas)
ALTER TABLE `student_alerts` ADD COLUMN `read_at` DATETIME(3) NULL;
CREATE INDEX `student_alerts_read_at_idx` ON `student_alerts`(`read_at`);

-- CreateTable: kanban_cards (Kanban admin)
CREATE TABLE `kanban_cards` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `setor` VARCHAR(100) NULL,
    `assigned_to_id` VARCHAR(191) NULL,
    `column` VARCHAR(20) NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `kanban_cards_column_idx`(`column`),
    INDEX `kanban_cards_assigned_to_id_idx`(`assigned_to_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `kanban_cards` ADD CONSTRAINT `kanban_cards_assigned_to_id_fkey` FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
