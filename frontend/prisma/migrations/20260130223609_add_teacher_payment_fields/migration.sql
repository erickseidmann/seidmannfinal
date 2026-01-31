-- AlterTable
ALTER TABLE `teachers` ADD COLUMN `cnpj` VARCHAR(191) NULL,
    ADD COLUMN `cpf` VARCHAR(191) NULL,
    ADD COLUMN `infos_pagamento` TEXT NULL,
    ADD COLUMN `metodo_pagamento` VARCHAR(191) NULL,
    ADD COLUMN `nome_preferido` VARCHAR(191) NULL,
    ADD COLUMN `valor_por_hora` DECIMAL(10, 2) NULL;
