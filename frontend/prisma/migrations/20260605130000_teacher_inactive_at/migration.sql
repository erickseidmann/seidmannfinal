-- Data de inativação do professor (corte de pagamento e listas operacionais)
ALTER TABLE `teachers` ADD COLUMN `inactive_at` DATETIME(3) NULL;

-- Professores já inativos: usar updated_at como referência do mês de corte
UPDATE `teachers` SET `inactive_at` = `updated_at` WHERE `status` = 'INACTIVE' AND `inactive_at` IS NULL;
