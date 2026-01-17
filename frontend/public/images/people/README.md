# Imagens de Pessoas - Seidmann Institute

Esta pasta contém as imagens de professores e alunos usadas na galeria da landing page.

## Estrutura Esperada

As seguintes imagens devem ser adicionadas nesta pasta:

- `teacher-1.jpg` - Professora em aula online de Inglês
- `student-1.jpg` - Aluna estudando Espanhol
- `class-1.jpg` - Turma em videochamada
- `teacher-2.jpg` - Professor nativo em aula
- `student-2.jpg` - Aluno praticando conversação
- `class-2.jpg` - Ambiente de estudo online

## Especificações Técnicas

- **Formato**: JPG ou PNG
- **Tamanho recomendado**: 800x600px ou proporção similar
- **Peso**: Máximo 500KB por imagem (otimizar para web)
- **Aspecto**: Retrato ou paisagem, mantendo consistência visual

## Como Substituir os Placeholders

1. Adicione as imagens reais nesta pasta com os nomes acima
2. Edite `src/components/landing/PeopleGallery.tsx`
3. Altere `placeholder: true` para `placeholder: false` para cada imagem que foi adicionada
4. As imagens serão automaticamente carregadas pelo Next.js Image component

## Notas

- As imagens devem ter boa qualidade e representar a diversidade da comunidade Seidmann
- Respeitar direitos de imagem e ter autorização para uso
- Considerar usar imagens de stock ou fotos profissionais se necessário
