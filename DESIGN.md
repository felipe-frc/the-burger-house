# Design System: The Burger House — Night Shift Counter

## Direção

A landing assume a energia de um balcão urbano aberto até tarde: fundo carbono, superfícies planas, fotografia de produto recortada e tipografia editorial comprimida. A estética americana aparece na linguagem de lanchonete e no ritmo publicitário, sem reproduzir diner retrô, mascote, xadrez ou ornamentos da versão anterior.

## Princípios

- Produto primeiro: burgers, acompanhamentos e bebidas são a única fotografia usada.
- Contraste gráfico: blocos sólidos e tipografia grande substituem cartões genéricos e decoração gratuita.
- Conversão direta: todo momento comercial aponta para `menu.html`.
- Movimento contido: uma entrada curta no palco da hero; feedbacks pequenos nos controles; redução de movimento respeitada.
- Mobile recomposto: seções empilham, ações ocupam a largura útil e nunca geram overflow horizontal.

## Cores

- Carbono `#12110f`: fundo principal, texto sobre superfícies claras e estrutura.
- Papel `#f2eadb`: texto principal, superfícies de produto e respiro.
- Papel reduzido `#d8cfbf`: texto secundário sobre carbono.
- Pickle `#b7f34a`: ação primária, sinalização e seção institucional.
- Tomate `#ff5a36`: seção do cardápio e linhas de energia.
- Azul céu `#62c7e7`: acento exclusivo do Praiano.

Evitar gradientes. Cada viewport importante deve ter um campo dominante e no máximo um acento forte.

## Tipografia

- Display: Archivo Black, usada em frases curtas, nomes de produto e wordmark.
- Corpo: DM Sans, pesos 400–700, usada em navegação, ingredientes e conteúdo institucional.
- Headline hero: `clamp(4rem, 7.2vw, 6rem)` no desktop e `clamp(3.6rem, 17vw, 5.2rem)` no mobile.
- Headlines de seção: `clamp(3.2rem, 6vw, 6rem)`.

## Formas e profundidade

Blocos e botões são retos, sem arredondamento decorativo. A profundidade pertence às fotografias, usando apenas `drop-shadow`; os campos cromáticos permanecem planos. O palco da hero usa uma forma recortada em pickle para enquadrar os três produtos.

## Layout

- Desktop: hero e preview de menu em duas colunas; histórias de produto alternam visual e texto; largura máxima de conteúdo em 1420px.
- Tablet até 1020px: hero e seções editoriais passam para uma coluna; navegação vira menu compacto.
- Mobile até 720px: padding lateral de 16px, CTAs em largura total, mosaico em uma coluna e palco de produto recortado sem overflow.

## Componentes

- Wordmark tipográfico: duas linhas, com “House” em pickle.
- Botão primário: fundo pickle sobre carbono, altura mínima de 52px.
- Palco de produto: três recortes oficiais sobre campo pickle, com etiquetas pretas.
- História de lançamento: imagem em campo próprio, ingrediente e uma assinatura curta.
- Mosaico de menu: quatro produtos reais, legenda escura sobre fundo papel.
- Nota da casa: campo pickle com princípios e chamada de carreira.

## Regras de uso

- Não reintroduzir logo ilustrado, mascote, xadrez, fotos do salão ou banners legados na landing.
- Não inventar preços, endereços, avaliações, urgência ou disponibilidade.
- Não distorcer nem cortar agressivamente as fotos; usar `object-fit: contain`.
- Não adicionar carrosséis automáticos, parallax ou animações concorrentes.
- Manter foco visível, alvos de toque confortáveis, contraste WCAG e `prefers-reduced-motion`.
