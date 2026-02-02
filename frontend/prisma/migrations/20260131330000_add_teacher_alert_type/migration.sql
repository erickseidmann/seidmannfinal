-- AlterTable: teacher_alerts - type para filtrar notificações no Início (PAYMENT_DONE, NEW_ANNOUNCEMENT, NEW_STUDENT)
ALTER TABLE `teacher_alerts` ADD COLUMN `type` VARCHAR(32) NULL;
CREATE INDEX `teacher_alerts_type_idx` ON `teacher_alerts`(`type`);
