-- AlterTable
ALTER TABLE `enrollments` ADD COLUMN `faturamento_tipo` VARCHAR(20) NOT NULL DEFAULT 'ALUNO',
    ADD COLUMN `faturamento_razao_social` VARCHAR(255) NULL,
    ADD COLUMN `faturamento_cnpj` VARCHAR(18) NULL,
    ADD COLUMN `faturamento_email` VARCHAR(255) NULL,
    ADD COLUMN `faturamento_endereco` TEXT NULL;
