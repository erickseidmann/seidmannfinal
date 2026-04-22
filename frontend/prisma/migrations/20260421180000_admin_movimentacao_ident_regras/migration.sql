-- Regras de categoria padrão por favorecido (identificação do extrato), por tipo Entrada/Saída
CREATE TABLE `admin_movimentacao_ident_regras` (
    `id` VARCHAR(191) NOT NULL,
    `identificacao_chave` VARCHAR(512) NOT NULL,
    `mov_tipo` VARCHAR(16) NOT NULL,
    `categoria_principal` VARCHAR(64) NOT NULL,
    `subcategoria` VARCHAR(64) NOT NULL DEFAULT '',
    `categoria_outro` VARCHAR(500) NOT NULL DEFAULT '',
    `identificacao_exemplo` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_movimentacao_ident_regras_identificacao_chave_mov_tipo_key`(`identificacao_chave`, `mov_tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
