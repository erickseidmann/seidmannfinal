-- AlterTable: teacher_alerts — vínculo opcional com matrícula (notificação «novo aluno»)
ALTER TABLE `teacher_alerts` ADD COLUMN `enrollment_id` VARCHAR(191) NULL;

CREATE INDEX `teacher_alerts_enrollment_id_idx` ON `teacher_alerts` (`enrollment_id`);

ALTER TABLE `teacher_alerts`
  ADD CONSTRAINT `teacher_alerts_enrollment_id_fkey`
  FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
