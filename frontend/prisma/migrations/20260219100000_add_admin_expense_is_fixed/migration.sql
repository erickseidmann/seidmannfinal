-- AlterTable: marcar despesas fixas (recorrentes como internet, aluguel)
ALTER TABLE `admin_expenses` ADD COLUMN `is_fixed` BOOLEAN NOT NULL DEFAULT false;
