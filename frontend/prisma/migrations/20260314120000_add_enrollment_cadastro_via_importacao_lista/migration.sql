-- Distingue matrículas criadas por importação CSV (lista) das demais (formulário, admin, etc.)
ALTER TABLE `enrollments` ADD COLUMN `cadastro_via_importacao_lista` BOOLEAN NOT NULL DEFAULT false;
