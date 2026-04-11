/**
 * Conteúdo e geração determinística dos mini-jogos de inglês (níveis 1–30 por jogo).
 * A dificuldade sobe com o nível via índices e embaralhamento com seed.
 */

export const LEVELS_PER_GAME = 30

export const GAME_SLUGS = ['pares', 'complete', 'quiz', 'ordene'] as const
export type GameSlug = (typeof GAME_SLUGS)[number]

export const GAME_META: Record<
  GameSlug,
  { title: string; short: string; description: string; emoji: string }
> = {
  pares: {
    title: 'Pares de palavras',
    short: 'Combine inglês ↔ português',
    description: 'Toque nos pares corretos até limpar o tabuleiro.',
    emoji: '🔗',
  },
  complete: {
    title: 'Complete a frase',
    short: 'Escolha a palavra certa',
    description: 'Leia a frase e escolha a opção que completa melhor.',
    emoji: '✏️',
  },
  quiz: {
    title: 'Quiz rápido',
    short: 'Gramática e vocabulário',
    description: 'Uma pergunta de múltipla escolha por nível.',
    emoji: '❓',
  },
  ordene: {
    title: 'Ordene a frase',
    short: 'Monte a frase em inglês',
    description: 'Clique nas palavras na ordem correta.',
    emoji: '🧩',
  },
}

/** Pares EN–PT (vocabulário geral) */
const PAIRS_POOL: { en: string; pt: string }[] = [
  { en: 'apple', pt: 'maçã' },
  { en: 'book', pt: 'livro' },
  { en: 'water', pt: 'água' },
  { en: 'house', pt: 'casa' },
  { en: 'friend', pt: 'amigo' },
  { en: 'school', pt: 'escola' },
  { en: 'teacher', pt: 'professor' },
  { en: 'student', pt: 'aluno' },
  { en: 'morning', pt: 'manhã' },
  { en: 'night', pt: 'noite' },
  { en: 'happy', pt: 'feliz' },
  { en: 'tired', pt: 'cansado' },
  { en: 'big', pt: 'grande' },
  { en: 'small', pt: 'pequeno' },
  { en: 'fast', pt: 'rápido' },
  { en: 'slow', pt: 'lento' },
  { en: 'hot', pt: 'quente' },
  { en: 'cold', pt: 'frio' },
  { en: 'today', pt: 'hoje' },
  { en: 'tomorrow', pt: 'amanhã' },
  { en: 'yesterday', pt: 'ontem' },
  { en: 'always', pt: 'sempre' },
  { en: 'never', pt: 'nunca' },
  { en: 'sometimes', pt: 'às vezes' },
  { en: 'because', pt: 'porque' },
  { en: 'but', pt: 'mas' },
  { en: 'and', pt: 'e' },
  { en: 'or', pt: 'ou' },
  { en: 'with', pt: 'com' },
  { en: 'without', pt: 'sem' },
  { en: 'under', pt: 'embaixo de' },
  { en: 'over', pt: 'sobre' },
  { en: 'before', pt: 'antes' },
  { en: 'after', pt: 'depois' },
  { en: 'easy', pt: 'fácil' },
  { en: 'difficult', pt: 'difícil' },
  { en: 'cheap', pt: 'barato' },
  { en: 'expensive', pt: 'caro' },
  { en: 'right', pt: 'certo / direita' },
  { en: 'wrong', pt: 'errado' },
  { en: 'question', pt: 'pergunta' },
  { en: 'answer', pt: 'resposta' },
]

export type BlankLevel = {
  sentence: string
  blank: string
  options: string[]
  correct: string
  tipPt: string
  wrongHints: Partial<Record<string, string>>
}

type BlankItem = BlankLevel

const BLANK_POOL: BlankItem[] = [
  {
    sentence: 'I ___ to school every day.',
    blank: 'go',
    options: ['go', 'goes', 'going', 'went'],
    correct: 'go',
    tipPt: 'Com I/you/we/they no presente simples usamos o verbo base (go).',
    wrongHints: {
      goes: '“Goes” é para he/she/it. Com “I” use a forma sem -s: go.',
      going: '“Going” é contínuo; “every day” indica hábito no presente simples.',
      went: '“Went” é passado; a frase fala de rotina de hoje (every day).',
    },
  },
  {
    sentence: 'She ___ English very well.',
    blank: 'speaks',
    options: ['speak', 'speaks', 'speaking', 'spoke'],
    correct: 'speaks',
    tipPt: 'Com she/he/it no presente simples o verbo leva -s/-es.',
    wrongHints: {
      speak: '“Speak” é a base; com “she” precisamos de speaks.',
      speaking: '“Speaking” é -ing; aqui é fato habitual, não ação agora.',
      spoke: '“Spoke” é passado; o contexto é presente (“very well” como habilidade).',
    },
  },
  {
    sentence: 'They ___ watching TV now.',
    blank: 'are',
    options: ['is', 'are', 'am', 'be'],
    correct: 'are',
    tipPt: 'Presente contínuo: they + are + verbo-ing.',
    wrongHints: {
      is: '“Is” vai com he/she/it, não com “they”.',
      am: '“Am” só com “I”.',
      be: '“Be” é infinitivo; aqui precisamos de are + watching.',
    },
  },
  {
    sentence: 'We ___ dinner at 7 pm yesterday.',
    blank: 'had',
    options: ['have', 'has', 'had', 'having'],
    correct: 'had',
    tipPt: '“Yesterday” pede passado; have vira had.',
    wrongHints: {
      have: '“Have” é presente; “yesterday” indica passado.',
      has: '“Has” é 3ª pessoa no presente; “we” + ontem = had.',
      having: '“Having” não combina com horário fixo no passado simples aqui.',
    },
  },
  {
    sentence: 'He doesn’t ___ coffee.',
    blank: 'like',
    options: ['likes', 'like', 'liking', 'liked'],
    correct: 'like',
    tipPt: 'Após doesn’t/don’t/didn’t vem sempre o verbo na forma base.',
    wrongHints: {
      likes: 'Depois de “doesn’t” não usamos -s; use like.',
      liking: 'Não usamos -ing logo após doesn’t nesta estrutura.',
      liked: '“Liked” seria passado; aqui é presente com doesn’t.',
    },
  },
  {
    sentence: '___ you help me, please?',
    blank: 'Can',
    options: ['Can', 'Should', 'Must', 'Would'],
    correct: 'Can',
    tipPt: 'Pedido educado de ajuda: “Can you …, please?” é natural.',
    wrongHints: {
      Should: '“Should” é mais conselho/obrigação moral; pedido comum usa Can/Could.',
      Must: '“Must” soa forte (obrigação); para favor use Can/Could.',
      Would: '“Would you help” existe, mas o exercício pede o pedido direto com Can.',
    },
  },
  {
    sentence: 'There ___ many books on the shelf.',
    blank: 'are',
    options: ['is', 'are', 'was', 'be'],
    correct: 'are',
    tipPt: '“Many books” é plural → there are.',
    wrongHints: {
      is: '“Many books” é plural; use are.',
      was: 'Sem indicação de passado isolado; concordância presente com plural = are.',
      be: 'Precisamos de are após “there” com substantivo plural.',
    },
  },
  {
    sentence: 'I have ___ finished my homework.',
    blank: 'already',
    options: ['yet', 'already', 'still', 'just'],
    correct: 'already',
    tipPt: 'Em frase afirmativa com have, “já” costuma ser already.',
    wrongHints: {
      yet: '“Yet” em afirmações com have é raro; yet aparece muito em negativas/perguntas.',
      still: '“Still” indica que continua; aqui o sentido é “já terminei” = already.',
      just: '“Just” = “acabei de”; already enfatiza que já está feito (encaixa melhor aqui).',
    },
  },
  {
    sentence: 'If it rains, we ___ stay home.',
    blank: 'will',
    options: ['will', 'would', 'can', 'must'],
    correct: 'will',
    tipPt: 'Condicional real (1º tipo): If + presente, … + will + verbo.',
    wrongHints: {
      would: '“Would” costuma ir com If + passado (2º tipo); aqui é if + rains (presente).',
      can: 'Pode até fazer sentido, mas o padrão ensinado do 1º condicional é will.',
      must: '“Must” expressa obrigação fixa; a estrutura padrão pede will.',
    },
  },
  {
    sentence: 'She has lived here ___ 2010.',
    blank: 'since',
    options: ['for', 'since', 'from', 'by'],
    correct: 'since',
    tipPt: 'Ponto no tempo passado (2010) → since; for + período (two years).',
    wrongHints: {
      for: '“For” + duração (for ten years); ano exato = since.',
      from: '“From” não marca início de período até agora como since.',
      by: '“By” indica prazo até; não é o caso aqui.',
    },
  },
  {
    sentence: 'This is ___ than that.',
    blank: 'better',
    options: ['good', 'better', 'best', 'well'],
    correct: 'better',
    tipPt: 'Com “than” usamos comparativo: better (good → better).',
    wrongHints: {
      good: '“Good” é adjetivo base; com than precisamos do comparativo better.',
      best: '“Best” é superlativo (the best); aqui é comparação entre dois = better.',
      well: '“Well” é advérbio; comparativo de qualidade entre coisas = better.',
    },
  },
  {
    sentence: 'I’m looking ___ my keys.',
    blank: 'for',
    options: ['at', 'for', 'after', 'on'],
    correct: 'for',
    tipPt: 'Look for = procurar (fixo em inglês).',
    wrongHints: {
      at: 'Look at = olhar para; procurar objeto perdido = look for.',
      after: 'Look after = cuidar de; não é “procurar chaves”.',
      on: 'Look on não expressa “procurar” neste sentido.',
    },
  },
  {
    sentence: 'Turn ___ the light, please.',
    blank: 'on',
    options: ['on', 'off', 'up', 'down'],
    correct: 'on',
    tipPt: 'Turn on the light = acender; turn off = apagar.',
    wrongHints: {
      off: 'Turn off apaga a luz; o pedido típico de acender é turn on.',
      up: 'Turn up = aumentar (volume); não é lâmpada.',
      down: 'Turn down = diminuir / recusar; não encaixa em “luz”.',
    },
  },
  {
    sentence: 'He’s interested ___ music.',
    blank: 'in',
    options: ['on', 'at', 'in', 'for'],
    correct: 'in',
    tipPt: 'Interested in + tema (colocação fixa).',
    wrongHints: {
      on: 'Não dizemos interested on; a preposição fixa é in.',
      at: 'Interested at não é natural em inglês padrão.',
      for: 'Interested for não é a colocação correta; use in.',
    },
  },
  {
    sentence: 'We should ___ the environment.',
    blank: 'protect',
    options: ['protect', 'protecting', 'protected', 'protects'],
    correct: 'protect',
    tipPt: 'Após should vem o verbo na forma base (sem to).',
    wrongHints: {
      protecting: 'Should + verbo base, não -ing.',
      protected: 'Should + base, não passado sozinho aqui.',
      protects: 'Sem -s após should (mesmo com we).',
    },
  },
]

export type QuizLevel = {
  q: string
  options: string[]
  correct: number
  wrongHints: Partial<Record<string, string>>
}

type QuizItem = QuizLevel

const QUIZ_POOL: QuizItem[] = [
  {
    q: 'Qual é o passado de “go”?',
    options: ['went', 'goed', 'gone', 'goes'],
    correct: 0,
    wrongHints: {
      goed: '“Goed” não existe; o passado irregular de go é went.',
      gone: '“Gone” é particípio (have gone); o passado simples é went.',
      goes: '“Goes” é presente (he/she goes), não passado.',
    },
  },
  {
    q: 'Escolha o plural de “child”.',
    options: ['childs', 'children', 'childrens', 'childes'],
    correct: 1,
    wrongHints: {
      childs: 'Plural de child é irregular: children, não childs.',
      childrens: 'O plural correto é children (sem -s no final).',
      childes: 'Forma inventada; memorize children.',
    },
  },
  {
    q: '“I ___ a student.” (presente simples, I)',
    options: ['am', 'is', 'are', 'be'],
    correct: 0,
    wrongHints: {
      is: '“Is” vai com he/she/it; com I usamos am.',
      are: '“Are” vai com you/we/they; com I = am.',
      be: 'Na afirmação “I … a student” usamos am, não be sozinho.',
    },
  },
  {
    q: 'Qual palavra completa: “She ___ from Brazil.”?',
    options: ['are', 'is', 'am', 'be'],
    correct: 1,
    wrongHints: {
      are: '“She” é 3ª pessoa do singular → is.',
      am: '“Am” só com I.',
      be: 'Precisamos de is com she no presente.',
    },
  },
  {
    q: '“They ___ playing football.” (present continuous)',
    options: ['is', 'am', 'are', 'be'],
    correct: 2,
    wrongHints: {
      is: 'Com they o auxiliar do presente contínuo é are.',
      am: '“Am” só com I.',
      be: 'Falta o auxiliar are antes do -ing com they.',
    },
  },
  {
    q: 'Qual artigo: “___ umbrella”?',
    options: ['A', 'An', 'The', '— (zero article)'],
    correct: 1,
    wrongHints: {
      A: 'Antes de som de vogal (umbrella), usamos an, não a.',
      The: 'The seria algo específico já conhecido; aqui é um guarda-chuva genérico = an.',
      '— (zero article)': 'Precisamos de artigo indefinido antes de umbrella (contável singular).',
    },
  },
  {
    q: '“Much” é usado com:',
    options: ['substantivos contáveis', 'substantivos incontáveis', 'plural sempre', 'verbos'],
    correct: 1,
    wrongHints: {
      'substantivos contáveis': 'Para contáveis no plural costuma-se many; much com incontáveis.',
      'plural sempre': 'Much não acompanha “plural sempre”; associe much a incontáveis.',
      verbos: 'Much qualifica substantivo (incontável), não verbo diretamente aqui.',
    },
  },
  {
    q: '“Few” indica:',
    options: ['muitos', 'poucos (contável)', 'pouco (incontável)', 'nenhum'],
    correct: 1,
    wrongHints: {
      muitos: 'Few = poucos (ideia de quantidade pequena), não “muitos”.',
      'pouco (incontável)': 'Pouco com incontável costuma ser little; few = contável.',
      nenhum: 'Few é poucos, não zero; “nenhum” seria closer a no / none.',
    },
  },
  {
    q: 'Qual preposição: “good ___ night”?',
    options: ['in', 'at', 'on', 'by'],
    correct: 1,
    wrongHints: {
      in: 'Dizemos at night / in the morning; good at night não é a colocação usual.',
      on: 'On night não é natural para essa expressão.',
      by: 'By night existe em outros contextos; “à noite” com good = at night.',
    },
  },
  {
    q: '“Used to” expressa:',
    options: ['hábito no passado', 'futuro', 'obrigação', 'permissão'],
    correct: 0,
    wrongHints: {
      futuro: 'Used to fala de passado, não de futuro.',
      obrigação: 'Obrigação seria must/have to; used to = costumava no passado.',
      permissão: 'Permissão seria can/may; não é o sentido de used to.',
    },
  },
  {
    q: 'Qual forma correta: “If I ___, I would travel.”',
    options: ['am rich', 'was rich', 'were rich', 'be rich'],
    correct: 2,
    wrongHints: {
      'am rich': 'No 2º condicional, If + were (todas as pessoas) é o padrão formal.',
      'was rich': 'Em If I … formal/ensinado, prefere-se were, não was.',
      'be rich': 'Falta were após I no 2º condicional.',
    },
  },
  {
    q: '“Neither … nor” significa:',
    options: ['ambos', 'nem … nem', 'ou … ou', 'tanto … quanto'],
    correct: 1,
    wrongHints: {
      ambos: 'Both = ambos; neither nor nega duas alternativas.',
      'ou … ou': 'Either … or = ou … ou; neither … nor = nem … nem.',
      'tanto … quanto': 'Both … and / as well as = tanto quanto; neither nor é negação dupla.',
    },
  },
]

/** Frases para ordenar (palavras separadas por |) + dica ao errar */
const ORDER_POOL: { line: string; hintPt: string }[] = [
  { line: 'I|like|to|study|English', hintPt: 'Sujeito + verbo gostar + to + verbo + objeto: I like to study English.' },
  { line: 'She|works|in|a|hospital', hintPt: 'Ordem: sujeito + verbo + lugar (in a hospital).' },
  { line: 'We|are|going|to|the|park', hintPt: 'Presente contínuo futuro planejado: be + going to + lugar.' },
  { line: 'They|have|two|children', hintPt: 'Presente perfeito ou presente simples com have: they have + objeto.' },
  { line: 'Can|you|help|me|please', hintPt: 'Pedido: modal + you + verbo + me; please no fim (ou início).' },
  { line: 'I|do|not|like|coffee', hintPt: 'Negação no presente: I do not + verbo + objeto.' },
  { line: 'What|time|do|you|wake|up', hintPt: 'Pergunta: What time + do/does + sujeito + verbo + partícula (wake up).' },
  { line: 'The|book|is|on|the|table', hintPt: 'Artigo + substantivo + is + preposição on + the + lugar.' },
  { line: 'My|favorite|color|is|blue', hintPt: 'My favorite + substantivo + is + adjetivo/cor.' },
  { line: 'I|usually|walk|to|school', hintPt: 'Advério de frequência perto do verbo: I usually walk to school.' },
  { line: 'He|plays|the|guitar|well', hintPt: 'He + plays + the + instrumento + advérbio (well).' },
  { line: 'There|is|a|cat|in|the|garden', hintPt: 'There is + a + animal + in + the + lugar.' },
  { line: 'We|should|drink|more|water', hintPt: 'We should + verbo base + complemento.' },
  { line: 'I|have|never|been|to|Paris', hintPt: 'Experiência: have + never + been to + lugar.' },
  { line: 'She|does|her|homework|every|day', hintPt: 'She does + possessivo + homework + every day.' },
]

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickIndex(seed: number, max: number, salt: number) {
  const rnd = mulberry32(seed * 1009 + salt * 17)
  return Math.floor(rnd() * max)
}

export type MatchLevel = {
  pairs: { id: string; en: string; pt: string }[]
  /** ids embaralhados para exibição em duas colunas */
  enSide: { id: string; text: string }[]
  ptSide: { id: string; text: string }[]
}

export function getMatchLevel(level: number): MatchLevel {
  const nPairs = Math.min(4 + Math.floor((level - 1) / 10), 6) // 4 a 6 pares
  const seed = level * 31 + 1
  const used = new Set<number>()
  const pairs: { id: string; en: string; pt: string }[] = []
  for (let i = 0; i < nPairs; i++) {
    let idx = pickIndex(seed + i * 97, PAIRS_POOL.length, i)
    while (used.has(idx)) idx = (idx + 1) % PAIRS_POOL.length
    used.add(idx)
    const p = PAIRS_POOL[idx]
    pairs.push({ id: `p${i}`, en: p.en, pt: p.pt })
  }
  const enSide = pairs.map((p) => ({ id: p.id, text: p.en }))
  const ptSide = pairs.map((p) => ({ id: p.id, text: p.pt }))
  const shuffle = <T,>(arr: T[], s: number) => {
    const a = [...arr]
    const r = mulberry32(s)
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  return {
    pairs,
    enSide: shuffle(enSide, seed + 2),
    ptSide: shuffle(ptSide, seed + 3),
  }
}

export function getBlankLevel(level: number): BlankItem {
  const idx = (level - 1 + pickIndex(level, BLANK_POOL.length, 42)) % BLANK_POOL.length
  const base = BLANK_POOL[idx]
  const seed = level * 13
  const r = mulberry32(seed)
  const opts = [...base.options]
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  return { ...base, options: opts }
}

export function getQuizLevel(level: number): QuizItem {
  const idx = (level - 1 + pickIndex(level, QUIZ_POOL.length, 99)) % QUIZ_POOL.length
  const base = QUIZ_POOL[idx]
  const seed = level * 7 + 11
  const r = mulberry32(seed)
  const opts = [...base.options]
  const correctText = opts[base.correct]
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  const correct = opts.indexOf(correctText)
  return { q: base.q, options: opts, correct, wrongHints: base.wrongHints }
}

export type OrderLevel = {
  words: string[]
  correctOrder: string[]
  hintPt: string
  /** Frase correta com espaços, para áudio */
  fullEn: string
}

export function getOrderLevel(level: number): OrderLevel {
  const idx = (level - 1) % ORDER_POOL.length
  const { line, hintPt } = ORDER_POOL[idx]
  const correctOrder = line.split('|')
  const seed = level * 19
  const r = mulberry32(seed)
  const words = [...correctOrder]
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[words[i], words[j]] = [words[j], words[i]]
  }
  return { words, correctOrder, hintPt, fullEn: correctOrder.join(' ') }
}

/** Explicação em português quando o aluno une inglês a português de pares diferentes. */
export function explainWrongPairMatch(
  pairs: { id: string; en: string; pt: string }[],
  idA: string,
  idB: string,
): string {
  const pa = pairs.find((p) => p.id === idA)
  const pb = pairs.find((p) => p.id === idB)
  if (!pa || !pb) {
    return 'Esses dois cartões não formam um par. Escolha a palavra em inglês e o português com o mesmo significado.'
  }
  return (
    `Você misturou dois pares. «${pa.en}» significa «${pa.pt}», e «${pb.en}» significa «${pb.pt}». ` +
    `Toque primeiro em uma palavra e depois na tradução certa do mesmo par.`
  )
}

export function isValidGameSlug(s: string): s is GameSlug {
  return (GAME_SLUGS as readonly string[]).includes(s)
}
