-- Níveis CEFR que cada professor está habilitado a ensinar
ALTER TABLE `teachers` ADD COLUMN `niveis_ensina` JSON NULL;
