-- AlterTable: enrollments - add cancelamento_antecedencia_horas (tempo mínimo de antecedência para cancelamento em horas)
ALTER TABLE `enrollments` ADD COLUMN `cancelamento_antecedencia_horas` INT NULL;

-- Definir valores padrão baseados na escola de matrícula
-- YOUBECOME: 24 horas (1 dia)
UPDATE `enrollments` SET `cancelamento_antecedencia_horas` = 24 WHERE `escola_matricula` = 'YOUBECOME';

-- Outros: 6 horas (padrão)
UPDATE `enrollments` SET `cancelamento_antecedencia_horas` = 6 WHERE `escola_matricula` IS NULL OR (`escola_matricula` != 'YOUBECOME' AND `cancelamento_antecedencia_horas` IS NULL);
