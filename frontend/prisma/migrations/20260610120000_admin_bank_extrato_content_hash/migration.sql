-- Hash SHA-256 do conteúdo do arquivo para impedir importação duplicada do mesmo extrato
ALTER TABLE `admin_bank_extratos` ADD COLUMN `content_hash` VARCHAR(64) NULL;

CREATE UNIQUE INDEX `admin_bank_extratos_content_hash_key` ON `admin_bank_extratos`(`content_hash`);
