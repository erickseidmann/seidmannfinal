-- migration: 20260422000000_add_karaoke_songs
CREATE TABLE `karaoke_songs` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `artist` VARCHAR(191) NOT NULL,
  `youtube_id` VARCHAR(191) NOT NULL,
  `level` VARCHAR(191) NOT NULL,
  `difficulty` VARCHAR(191) NOT NULL,
  `emoji` VARCHAR(191) NULL,
  `lyrics` TEXT NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
