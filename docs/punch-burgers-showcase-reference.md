# Vitrine de favoritos — referência e implementação

Data: 03/11/2026. Referência pública: https://www.punchburgers.com.br/, seção **NOSSOS BURGERS**. Implementação independente, usando exclusivamente dados, fotografias e fontes existentes da The Burger House. Nenhum recurso da Punch foi incorporado à aplicação.

## Evidência e método

**CONFIRMADO:** inspeção real com Chromium/Playwright, DOM, estilos computados, `getAnimations()` e keyframes das transições. Foram observados Carbonara, Chicken Punch e Cheeseburger, saída do cursor, reversões rápidas e os viewports 1440, 768 e 375 px. O REA reconheceu o alvo CDP na descoberta inicial; as conclusões abaixo provêm das capturas Playwright, não de uma análise REA de código-fonte.

Evidências reproduzíveis em `audit/punch-showcase-2026-11-03/`:

- `inspect-reference.mjs`, `reference-initial.json`, `reference-desktop-initial.png`: estrutura inicial, scripts e estilos carregados.
- `measure-reference.mjs`, `reference-measurements.json`: geometria e três sequências de hover, keyframes, reversões e dois toques.
- `reference-composition.mjs`, `reference-composition.json`: ancestrais, tipografia e posição do CTA.
- `reference-1440.png`, `reference-768.png`, `reference-375.png`, `reference-desktop-hover.png`: capturas da referência.

## Composição observada

Valores medidos naquele carregamento; coordenadas podem variar com conteúdo e fontes.

| Aspecto | Referência confirmada | Adaptação The Burger House |
| --- | --- | --- |
| Produtos e distribuição | Dez; cinco colunas e duas linhas em 1440 e 768 px; uma coluna em 375 px | Seis; três colunas acima de 1000 px, duas abaixo |
| Container desktop | 1140 px exterior, conteúdo entre x=160 e x=1280: 1120 px | Conteúdo máximo de 1120 px |
| Células | Aproximadamente 202–220 × 280 px no desktop; 355 × 280 px no mobile | Slot visual estável de 252 px, nome e preço externos |
| Intervalos | Colunas com preenchimento lateral de 10 px; linhas separadas por 20 px | Desktop: 42 px horizontal e 26 px vertical; mobile: 16 e 24 px |
| Fotografia inicial | Carbonara: 176,77 × 171,23 px no desktop; fonte 800 × 775; centralizada | Fotos reais maiores em três colunas; `object-fit: contain`, sem alterar o arquivo ou proporção |
| Nome | Centralizado, Dela Gothic One 20/30 px; margem superior de 25 px; dentro da face frontal | Anton existente, nome abaixo da região interativa, permanentemente identificável |
| Selos | Visíveis junto ao topo da fotografia; front DOM contém um único `img`, sem selo independente nos primeiros produtos | Um sticker DOM por produto; acompanha a saída da foto |
| Área interativa | Caixa `.elementor-flip-box`, com `tabindex=0`, duas faces filhas | Botão nativo com estado, foco visível, descrição acessível e Escape |
| CTA | 290,58 × 64 px; topo 91 px abaixo do fim da última caixa | SpecularButton existente; margem de 30 px após a grade |
| Fundo | Preto | Creme `#FFF7E3`, azul, coral e amarelo existentes |

**INFERIDO:** os selos vistos nos primeiros produtos estão incorporados às fotografias: há apenas um `img` nessa face e nenhum nó separado correspondente. A composição interna dos arquivos originais não foi editada nem reconstruída.

## Animação original

**CONFIRMADO:** widgets WordPress/Elementor `elementor-flip-box--effect-flip` e `elementor-flip-box--direction-up`, com faces `.elementor-flip-box__front` e `.elementor-flip-box__back`. A caixa tem perspectiva de 1000 px. As faces usam `preserve-3d` e `backface-visibility: hidden`.

| Camada | Inicial → hover | Duração | Curva | Atraso | Evidência |
| --- | --- | --- | --- | --- | --- |
| Frente | `none` → `rotateX(180deg) rotateY(0deg)` | 600 ms | `ease-in-out` | 0 | Keyframes `CSSTransition` |
| Verso | `rotateX(-180deg) rotateY(0deg)` → `none` | 600 ms | `ease-in-out` | 0 | Keyframes `CSSTransition` |
| Retorno | Estados iniciais restaurados ao retirar o cursor | 600 ms configurados | `ease-in-out` | 0 | Matrizes finais nos três produtos |

O efeito observado é um flip físico vertical, não uma rotação horizontal presumida. Foto e nome pertencem à mesma face frontal. Não apareceu escala independente nos keyframes capturados. Não foi identificada uma timeline GSAP conduzindo esse efeito: o navegador registrou transições CSS. Isso não afirma ausência de JavaScript em outras partes do site.

**CONFIRMADO:** no Chromium touch de 375 px, o primeiro toque revelou o verso; o segundo toque no mesmo produto o manteve aberto. Reversões rápidas no desktop terminaram no estado esperado.

**NÃO IDENTIFICADO:** comportamento em Safari/iOS físico; eventual animação inicial da grade antes de ela entrar no viewport. Nenhuma duração de entrada foi inventada ou adicionada à nova seção.

## Implementação própria

- `frontend-ai-studio/src/components/BurgerMenu.tsx`: substitui o carrossel por uma única grade; remove setas, paginação, duplicação desktop/mobile e botões individuais de compra. Mantém título, subtítulo, `id="menu"`, contrato de props e callback do CTA.
- `src/components/burger-menu/BurgerShowcaseItem.tsx`: fotografia e selo giram verticalmente até 100°, com fade, em 500 ms `ease-in-out`. Ingredientes entram por opacidade em 220 ms, após 180 ms na abertura; fecham sem esse atraso. O painel textual não recebe rotação, escala, deslocamento ou filtro. Não há loops, Canvas ou biblioteca nova nesse efeito.
- `src/components/burger-menu/BurgerShowcaseBadge.tsx`: sistema reutilizável de stickers.
- `src/components/burger-menu/BurgerShowcase.css`: estilos restritos à seção; tipografia Barlow Condensed/Anton existente, foco e movimento reduzido. O slot constante acomoda inclusive os ingredientes completos de O Praiano em 375 px, sem truncamento.

Mouse abre ao entrar na célula e fecha ao sair. Toque/click alterna o botão; somente um produto fica aberto por vez. Enter/Espaço alternam, Escape fecha e a saída de foco fecha. Em movimento reduzido, não há giro nem transição. Os nomes e preços permanecem externos à animação.

### Dados e selos

`src/utils/menu.ts` permanece como fonte de produtos, imagens e preços. `burgerIngredients()` existente estrutura as frases sem inventar ingredientes; o texto completo é apresentado como uma frase legível, sem tabela extensa. Nenhum valor foi duplicado no componente.

| Produto | Selo | Fundamentação |
| --- | --- | --- |
| The Classic | CLÁSSICO | Nome e descrição |
| Double Smash | DUPLO | Dois hambúrgueres descritos no catálogo |
| Smokehouse BBQ | DEFUMADO | Barbecue defumado descrito |
| Crispy Cheddar | FRANGO | Filé de frango confirmado |
| Onion Crunch | CROCANTE | Bacon e onion rings descritos |
| O Praiano | ESPECIAL | Destaque editorial solicitado; não classificação oficial |

### Nutrição

**CONFIRMADO:** há campos nutricionais em `menu.ts`, também presentes na cópia histórica do frontend pesquisada. Não foi encontrado um componente funcional de informação nutricional no código atual ou nessa cópia. Não foi encontrada procedência, base por porção ou validação técnica dos números. Os dados permanecem intactos e não foram apresentados como tabela oficial. Não há um modal funcional existente removido por esta alteração. Disponibilizar informação nutricional validada continua sendo uma lacuna independente.

## Validação final

`npm run lint` (TypeScript): aprovado. `npm run build`: aprovado. Os sete testes aplicáveis de catálogo, totais, formulário e parser de ingredientes passaram. O build conserva avisos já existentes sobre `__dirname` na configuração Vite e bundle acima de 500 kB; nenhum ajuste de configuração foi feito para ocultá-los.

`validate-showcase.mjs` e `validation.json` documentam testes reais em `http://127.0.0.1:3001/`:

- Seis fotos carregadas, seis nomes/preços reais e ingredientes completos nos três breakpoints.
- Hover/saída em cada produto, reversões rápidas, toque para abrir/fechar e exclusividade de abertura no touch.
- Posição vertical dos nomes invariável antes/depois; nenhum conteúdo excede o slot de leitura.
- Painel aberto com `transform: none`, `filter: none` e opacidade 1; revisão visual das capturas desktop/mobile.
- Teclado, Escape, movimento reduzido, CTA abrindo o cardápio completo e ausência de overflow horizontal.
- Nenhum erro JavaScript de página capturado nos três cenários. Não foi realizado teste em hardware móvel físico.

| Viewport | Colunas | Altura medida da grade, sem cabeçalho/CTA |
| --- | --- | --- |
| 1440 px | 3 | 723 px |
| 768 px | 2 | 1071 px |
| 375 px | 2 | 1051 px |

Capturas finais: `showcase-1440.png`, `showcase-open-1440.png`, `showcase-768.png`, `showcase-375.png`, `showcase-open-375.png`, `showcase-mobile-grid.png` e `showcase-mobile-grid-open.png` na pasta de auditoria.

## Diferenças deliberadas e preservação de escopo

Fotografias, fundo, fontes e stickers são da The Burger House; a grade segue o escopo de seis produtos em vez dos dez da referência. No mobile usa duas colunas em vez de uma. A referência gira ambas as faces e seu título; aqui somente a imagem gira, enquanto ingredientes e nome permanecem planos. A transição foi reduzida de 600 para 500 ms e ganhou fade para impedir texto legível em ângulo intermediário. O CTA conserva a aparência aprovada da loja. Os stickers têm implementação independente, sem reutilizar imagens da Punch.

`before-manifest.json` e `scope-verification.json` confirmam que, entre arquivos preexistentes de `src` e `public`, somente `BurgerMenu.tsx` mudou. Foram criados os três auxiliares acima, o relatório e evidências de auditoria. Hero, Navbar, outras seções, catálogo, assets, carrinho e integrações permanecem intactos. Os antigos auxiliares de flip foram preservados, mas não são mais usados nesta seção. Sem dependências, backup permanente, commit, push ou deploy.
