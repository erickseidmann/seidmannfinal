-- AlterTable: teacher_alerts - add read_at for "unread" notifications (e.g. payment done)
ALTER TABLE `teacher_alerts` ADD COLUMN `read_at` DATETIME(3) NULL;
