-- AlterTable: tipo de aula (PARTICULAR/GRUPO) e nome do grupo
ALTER TABLE `enrollments` ADD COLUMN `tipo_aula` VARCHAR(20) NULL,
    ADD COLUMN `nome_grupo` VARCHAR(255) NULL;
