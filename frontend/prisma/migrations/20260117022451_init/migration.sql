-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `whatsapp` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollments` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `nome` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `whatsapp` VARCHAR(191) NOT NULL,
    `idioma` ENUM('ENGLISH', 'SPANISH') NOT NULL,
    `nivel` VARCHAR(191) NOT NULL,
    `objetivo` VARCHAR(191) NULL,
    `disponibilidade` VARCHAR(191) NULL,
    `status` ENUM('LEAD', 'REGISTERED', 'COMPLETED') NOT NULL DEFAULT 'LEAD',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `enrollments_email_idx`(`email`),
    INDEX `enrollments_whatsapp_idx`(`whatsapp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_info` (
    `id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `metodo` ENUM('PIX') NOT NULL DEFAULT 'PIX',
    `valor_mensal` DECIMAL(10, 2) NOT NULL,
    `data_pagamento` DATETIME(3) NOT NULL,
    `lembrete` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_info_enrollment_id_key`(`enrollment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_info` ADD CONSTRAINT `payment_info_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
