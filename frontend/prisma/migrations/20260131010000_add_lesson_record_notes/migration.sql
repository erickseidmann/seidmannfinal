-- AlterTable: adicionar campos de observações e descrição da aula de conversação em lesson_records
ALTER TABLE `lesson_records` ADD COLUMN `conversation_description` TEXT NULL,
ADD COLUMN `notes` TEXT NULL,
ADD COLUMN `notes_for_student` TEXT NULL,
ADD COLUMN `notes_for_parents` TEXT NULL;
