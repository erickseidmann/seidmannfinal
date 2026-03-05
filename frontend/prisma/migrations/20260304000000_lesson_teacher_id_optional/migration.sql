-- AlterTable: permitir teacher_id NULL (professor desistiu do aluno = aulas ficam sem professor)
ALTER TABLE `lessons` MODIFY COLUMN `teacher_id` VARCHAR(191) NULL;
