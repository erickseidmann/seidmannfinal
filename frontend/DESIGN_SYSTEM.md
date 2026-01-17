# Design System - Seidmann Institute

Documentação do design system e branding do projeto.

## 🎨 Cores da Marca

### Cores Principais

- **brand-yellow**: `#FFC107` - Amarelo dourado
- **brand-orange**: `#FF9800` - Laranja vibrante
- **brand-orange-dark**: `#F57C00` - Laranja escuro
- **brand-text**: `#333333` - Texto principal

### Gradientes

- **gradient-brand**: `linear-gradient(135deg, #FF9800 0%, #FFC107 100%)`
- **gradient-seidmann**: Alias para gradient-brand (compatibilidade)

### Uso no Tailwind

```tsx
// Cores
<div className="bg-brand-orange text-brand-yellow">
<div className="text-brand-text">

// Gradientes
<div className="bg-gradient-brand">
<div className="bg-gradient-to-r from-brand-orange to-brand-yellow">
```

## 🔤 Tipografia

### Fontes

- **Sans (corpo)**: Inter - Para textos, parágrafos, labels
- **Display (títulos)**: Poppins - Para títulos, headings, CTAs

### Classes Utilitárias

```tsx
// Headings
<h1 className="heading-1">Título Principal</h1>
<h2 className="heading-2">Subtítulo</h2>
<h3 className="heading-3">Título Secundário</h3>

// Texto com gradiente
<span className="text-gradient-brand">Texto em gradiente</span>
```

## 🎯 Componentes do Design System

### Botões

#### Primário (gradiente laranja→amarelo)
```tsx
<Button variant="primary" size="lg">Matricule-se</Button>
// ou usando classes
<button className="btn-primary btn-primary-lg">Matricule-se</button>
```

#### Secundário (outline)
```tsx
<Button variant="outline" size="md">Ver mais</Button>
// ou usando classes
<button className="btn-secondary">Ver mais</button>
```

### Cards

```tsx
<Card hover>
  <h3>Título do Card</h3>
  <p>Conteúdo do card</p>
</Card>

// ou usando classes
<div className="card card-hover">
  <h3>Título do Card</h3>
</div>
```

### Inputs

```tsx
<input type="text" className="input" placeholder="Seu nome" />
```

### Logo

```tsx
<Logo size="md" variant="color" />
<Logo size="lg" variant="white" href="/" />
```

**Props:**
- `size`: `'sm' | 'md' | 'lg'`
- `variant`: `'color' | 'white'`
- `href`: URL (padrão: `/`)
- `className`: Classes adicionais

## 📐 Espaçamento

### Classes Utilitárias

- `.section` - Padding vertical para seções (py-20 md:py-24)
- `.container-content` - Container centralizado com padding (container mx-auto px-4 max-w-7xl)

## 🎨 Uso Estratégico de Cores

### Backgrounds

- **Neutro**: Branco (#FFFFFF) - padrão
- **Suave**: `from-orange-50 to-white` - seções alternadas
- **Destaque**: `bg-gradient-brand` - CTAs e elementos importantes
- **Escuro**: `bg-brand-text` - Footer e elementos contrastantes

### Texto

- **Principal**: `text-brand-text` (#333333)
- **Secundário**: `text-gray-600`
- **Destacado**: `text-brand-orange`
- **Em gradiente**: `text-gradient-brand`

## 📱 Responsividade

O design system segue mobile-first:
- Breakpoints padrão do Tailwind (sm, md, lg, xl)
- Componentes adaptam automaticamente
- Typography scale responsivo

## ♿ Acessibilidade

- Contraste WCAG AA garantido
- Focus states visíveis
- ARIA labels em componentes interativos
- Navegação por teclado

## 📦 Estrutura de Arquivos

```
src/
├── components/
│   ├── ui/           # Componentes base (Button, Card, Logo)
│   └── layout/       # Layout global (Header, Footer)
├── lib/
│   └── utils.ts      # Utilitários (cn, helpers)
└── app/
    ├── globals.css   # Estilos globais e design system
    └── layout.tsx    # Layout raiz
```
