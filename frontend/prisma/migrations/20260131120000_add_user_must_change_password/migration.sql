-- AlterTable: adicionar must_change_password em users (professor deve alterar senha no primeiro acesso)
ALTER TABLE `users` ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false;
