-- Alocações de um recebimento a vários alunos (1 pagamento → N matrículas)

CREATE TABLE `received_payment_allocation` (
    `id` VARCHAR(191) NOT NULL,
    `received_payment_id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NOT NULL,
    `enrollment_payment_month_id` VARCHAR(191) NULL,
    `valor_centavos` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `received_payment_allocation_received_payment_id_idx`(`received_payment_id`),
    INDEX `received_payment_allocation_enrollment_id_idx`(`enrollment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `received_payment_allocation` ADD CONSTRAINT `received_payment_allocation_received_payment_id_fkey` FOREIGN KEY (`received_payment_id`) REFERENCES `received_payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `received_payment_allocation` ADD CONSTRAINT `received_payment_allocation_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `received_payment_allocation` ADD CONSTRAINT `received_payment_allocation_enrollment_payment_month_id_fkey` FOREIGN KEY (`enrollment_payment_month_id`) REFERENCES `enrollment_payment_months`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
