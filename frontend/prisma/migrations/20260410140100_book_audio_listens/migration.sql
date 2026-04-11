-- CreateTable
CREATE TABLE `book_audio_listens` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `book_audio_id` VARCHAR(191) NOT NULL,
    `listened_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `book_audio_listens_user_id_idx`(`user_id`),
    INDEX `book_audio_listens_book_audio_id_idx`(`book_audio_id`),
    UNIQUE INDEX `book_audio_listens_user_id_book_audio_id_key`(`user_id`, `book_audio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `book_audio_listens` ADD CONSTRAINT `book_audio_listens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `book_audio_listens` ADD CONSTRAINT `book_audio_listens_book_audio_id_fkey` FOREIGN KEY (`book_audio_id`) REFERENCES `book_audios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
