-- Quem inativou a matrícula (User admin)
ALTER TABLE `enrollments` ADD COLUMN `inactive_by_user_id` VARCHAR(191) NULL;
CREATE INDEX `enrollments_inactive_by_user_id_idx` ON `enrollments`(`inactive_by_user_id`);
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_inactive_by_user_id_fkey` FOREIGN KEY (`inactive_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
