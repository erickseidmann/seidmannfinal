-- Ajuste de letra: ignorar N segundos iniciais do vídeo (intro instrumental)
ALTER TABLE `karaoke_songs` ADD COLUMN `start_offset_sec` DOUBLE NOT NULL DEFAULT 0;
