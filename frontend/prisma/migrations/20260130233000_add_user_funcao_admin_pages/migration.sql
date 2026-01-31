-- AlterTable
ALTER TABLE `users` ADD COLUMN `funcao` VARCHAR(255) NULL,
    ADD COLUMN `admin_pages` JSON NULL;
