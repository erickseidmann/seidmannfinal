-- CreateTable
CREATE TABLE `books` (
    `id` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `level` VARCHAR(20) NOT NULL,
    `total_paginas` INTEGER NOT NULL,
    `imprimivel` BOOLEAN NOT NULL DEFAULT true,
    `pdf_path` VARCHAR(500) NULL,
    `capa_path` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `books_level_idx`(`level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `book_releases` ADD COLUMN `book_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `book_releases_book_id_idx` ON `book_releases`(`book_id`);

-- AddForeignKey
ALTER TABLE `book_releases` ADD CONSTRAINT `book_releases_book_id_fkey` FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
