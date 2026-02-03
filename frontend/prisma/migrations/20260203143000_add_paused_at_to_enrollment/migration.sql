-- AlterTable
ALTER TABLE `enrollments` ADD COLUMN `paused_at` DATETIME(3) NULL;

-- RenameIndex
ALTER TABLE `chat_messages` RENAME INDEX `chat_messages_criadoEm_idx` TO `chat_messages_created_at_idx`;

-- RenameIndex
ALTER TABLE `conversations` RENAME INDEX `conversations_criadoEm_idx` TO `conversations_created_at_idx`;
