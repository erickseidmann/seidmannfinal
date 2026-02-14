-- AlterTable: lessons - add created_by_id and created_by_name (rastrear quem agendou a aula)
ALTER TABLE `lessons` ADD COLUMN `created_by_id` VARCHAR(191) NULL;
ALTER TABLE `lessons` ADD COLUMN `created_by_name` VARCHAR(255) NULL;
CREATE INDEX `lessons_created_by_id_idx` ON `lessons`(`created_by_id`);

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
