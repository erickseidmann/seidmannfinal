-- Categoria da tarefa: Gestão ou Financeiro
ALTER TABLE `admin_dashboard_todos` ADD COLUMN `category` ENUM('GESTAO', 'FINANCEIRO') NOT NULL DEFAULT 'GESTAO';
