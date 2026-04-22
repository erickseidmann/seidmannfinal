-- AlterTable
ALTER TABLE `users` ADD COLUMN `linked_teacher_id` VARCHAR(191) NULL,
    ADD COLUMN `admin_payment_due_day` INTEGER NULL;

-- CreateIndex
CREATE INDEX `users_linked_teacher_id_idx` ON `users`(`linked_teacher_id`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_linked_teacher_id_fkey` FOREIGN KEY (`linked_teacher_id`) REFERENCES `teachers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
