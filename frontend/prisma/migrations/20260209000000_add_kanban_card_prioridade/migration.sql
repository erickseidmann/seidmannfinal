-- AlterTable: adiciona coluna prioridade em kanban_cards (EMERGENCIA | PODE_ESPERAR | FIQUE_ATENTO)
ALTER TABLE `kanban_cards` ADD COLUMN `prioridade` VARCHAR(20) NULL;
