-- AlterTable
ALTER TABLE `teacher_alerts` ADD COLUMN `created_by_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `teacher_alerts_created_by_id_idx` ON `teacher_alerts`(`created_by_id`);

-- AddForeignKey
ALTER TABLE `teacher_alerts` ADD CONSTRAINT `teacher_alerts_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
