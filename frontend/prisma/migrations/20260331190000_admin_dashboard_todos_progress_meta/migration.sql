ALTER TABLE `admin_dashboard_todos`
  ADD COLUMN `progress_updated_at` DATETIME(3) NULL,
  ADD COLUMN `progress_by_user_id` VARCHAR(191) NULL;

ALTER TABLE `admin_dashboard_todos`
  ADD INDEX `admin_dashboard_todos_progress_by_user_id_idx`(`progress_by_user_id`);

ALTER TABLE `admin_dashboard_todos`
  ADD CONSTRAINT `admin_dashboard_todos_progress_by_user_id_fkey`
  FOREIGN KEY (`progress_by_user_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
