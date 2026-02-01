-- AlterTable
ALTER TABLE `payment_info` ADD COLUMN `quem_paga` VARCHAR(255) NULL,
    ADD COLUMN `valor_hora` DECIMAL(10, 2) NULL,
    ADD COLUMN `banco` VARCHAR(100) NULL,
    ADD COLUMN `periodo_pagamento` VARCHAR(20) NULL,
    ADD COLUMN `nota_fiscal_emitida` BOOLEAN NULL;
