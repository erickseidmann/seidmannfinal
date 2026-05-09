-- Adiciona coluna `language` em books (ENUM Language). Nullable para livros legados.
ALTER TABLE `books`
    ADD COLUMN `language` ENUM('ENGLISH', 'SPANISH') NULL;

-- Índice para consulta rápida por idioma (auto-liberação livro↔professor).
CREATE INDEX `books_language_idx` ON `books`(`language`);
