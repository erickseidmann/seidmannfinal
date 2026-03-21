-- Motivo da inativação (enum + texto opcional para OUTRO)
ALTER TABLE `enrollments` ADD COLUMN `inactive_reason` ENUM(
  'FINANCEIRO',
  'SEM_TEMPO_AULAS',
  'PROBLEMAS_METODO',
  'PROBLEMAS_PROFESSORES',
  'PROBLEMAS_GESTAO_ESCOLA',
  'NAO_GOSTOU',
  'OUTRO'
) NULL;
ALTER TABLE `enrollments` ADD COLUMN `inactive_reason_other` VARCHAR(500) NULL;
