-- AlterTable: adicionar curso e tempo de aula em lesson_records
ALTER TABLE `lesson_records` ADD COLUMN `curso` VARCHAR(50) NULL,
ADD COLUMN `tempo_aula_minutos` INTEGER NULL;
