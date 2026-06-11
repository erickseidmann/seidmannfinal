-- Rastreio de quem adicionou/editou alunos e professores
ALTER TABLE `enrollments`
  ADD COLUMN `created_by_id` VARCHAR(191) NULL,
  ADD COLUMN `created_by_name` VARCHAR(255) NULL,
  ADD COLUMN `updated_by_id` VARCHAR(191) NULL,
  ADD COLUMN `updated_by_name` VARCHAR(255) NULL;

ALTER TABLE `enrollments`
  ADD CONSTRAINT `enrollments_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `enrollments_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `enrollments_created_by_id_idx` ON `enrollments`(`created_by_id`);
CREATE INDEX `enrollments_updated_by_id_idx` ON `enrollments`(`updated_by_id`);

ALTER TABLE `teachers`
  ADD COLUMN `created_by_id` VARCHAR(191) NULL,
  ADD COLUMN `created_by_name` VARCHAR(255) NULL,
  ADD COLUMN `updated_by_id` VARCHAR(191) NULL,
  ADD COLUMN `updated_by_name` VARCHAR(255) NULL;

ALTER TABLE `teachers`
  ADD CONSTRAINT `teachers_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `teachers_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `teachers_created_by_id_idx` ON `teachers`(`created_by_id`);
CREATE INDEX `teachers_updated_by_id_idx` ON `teachers`(`updated_by_id`);
