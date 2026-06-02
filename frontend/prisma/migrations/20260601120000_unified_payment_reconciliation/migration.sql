-- CreateTable
CREATE TABLE `payer_link` (
    `id` VARCHAR(191) NOT NULL,
    `documento` VARCHAR(191) NOT NULL,
    `documento_tipo` ENUM('CPF', 'CNPJ') NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `nome_pagador` VARCHAR(255) NULL,
    `apelido` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `payer_link_documento_idx`(`documento`),
    UNIQUE INDEX `payer_link_documento_enrollment_id_key`(`documento`, `enrollment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `received_payment` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('CORA', 'INFINITEPAY', 'SANTANDER', 'LIXEL') NOT NULL,
    `provider_payment_id` VARCHAR(255) NOT NULL,
    `valor` INTEGER NOT NULL,
    `data_pagamento` DATETIME(3) NOT NULL,
    `metodo` VARCHAR(50) NULL,
    `documento_pagador` VARCHAR(14) NULL,
    `nome_pagador` VARCHAR(255) NULL,
    `txid` VARCHAR(255) NULL,
    `end_to_end_id` VARCHAR(255) NULL,
    `referencia` VARCHAR(255) NULL,
    `status` ENUM('PENDENTE', 'VINCULADO', 'IGNORADO') NOT NULL DEFAULT 'PENDENTE',
    `divergencia_valor` BOOLEAN NOT NULL DEFAULT false,
    `sem_cobranca_aberta` BOOLEAN NOT NULL DEFAULT false,
    `enrollment_id` VARCHAR(191) NULL,
    `enrollment_payment_month_id` VARCHAR(191) NULL,
    `cora_invoice_id` VARCHAR(191) NULL,
    `raw_payload` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `received_payment_status_created_at_idx`(`status`, `created_at`),
    INDEX `received_payment_documento_pagador_idx`(`documento_pagador`),
    UNIQUE INDEX `received_payment_provider_provider_payment_id_key`(`provider`, `provider_payment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `payer_link` ADD CONSTRAINT `payer_link_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `received_payment` ADD CONSTRAINT `received_payment_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `received_payment` ADD CONSTRAINT `received_payment_enrollment_payment_month_id_fkey` FOREIGN KEY (`enrollment_payment_month_id`) REFERENCES `enrollment_payment_months`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `received_payment` ADD CONSTRAINT `received_payment_cora_invoice_id_fkey` FOREIGN KEY (`cora_invoice_id`) REFERENCES `cora_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
