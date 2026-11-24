# Padronização tipográfica — The Burger House 2.0

Data: 03/11/2026. Escopo executado: frontend local `frontend-ai-studio`, validado em `http://127.0.0.1:3001/`. Sistema final: **Anton para títulos e destaques; Barlow Condensed para descrições, interface, valores e formulários**.

## A. Inventário anterior

Inventário de declarações, imports, variáveis e utilitários em `audit/typography-2026-11-03/source-inventory-before.json`. Inspecionados os fontes próprios CSS/TS/TSX/JS/JSX/HTML, entrada HTML, configurações Vite/Tailwind, scripts auxiliares e presença de páginas/fontes em `public`. Dependências, arquivos gerados, imagens e cópias históricas não foram tratados como código de interface ativo.

| Família | Origem encontrada | Uso efetivo antes | Tratamento |
| --- | --- | --- | --- |
| Anton | Google Fonts em `index.html`; variáveis globais e literais nos CSS | Hero, Sobre, nomes de burgers, destaques e parte dos títulos | Mantida; peso real 400; famílias locais passam a usar o token global |
| Barlow Condensed | Mesmo link Google Fonts; estilos globais, Navbar e botão compartilhado | Descrições, interface, preços e também alguns títulos com `font-heading` | Mantida; títulos semânticos corrigidos para Anton |
| Bricolage Grotesque | `@import` e tokens locais de `LocationsSection.css`, mais fallbacks locais | Título de Locations e nome da unidade | Import e sobrescritas removidos |
| Gabarito | Mesmo import e tokens locais de Locations | Contatos, endereço, funcionamento e controles da unidade | Import e sobrescritas removidos |
| Gabarito, configuração legada | `tailwind.config.js` na raiz externa ao frontend atual | Configuração do projeto antigo, com `content` apontando para `./index.html` e `./scripts/**/*.js` | Ocorrência inativa para este bundle; preservada fora do escopo |
| Impact, `sans-serif`, `system-ui`, `-apple-system` | Fallbacks próprios | Fallbacks, não famílias de design carregadas | Consolidado o uso nos tokens; Impact e sans-serif permanecem no token principal conforme a missão |
| Defaults do Tailwind | Tema/preflight de dependência | Fallbacks de framework; não uma família adicional usada nas capturas finais | Aliases próprios `sans/body/heading/display` definidos na configuração CSS v4 |

Não foi encontrada declaração de Inter como família de design nos fontes próprios do frontend atual. Não há arquivo local de fonte nem `@font-face` próprio em uso. Não há área administrativa implementada neste App; a administração legada da raiz é outro ponto de entrada e não foi alterada ou apresentada como validada.

### Conflitos identificados

- Tokens locais de Locations substituíam os tokens globais.
- Havia famílias repetidas em CSS de componentes e **21 declarações de `font-family` com `!important`**.
- A classe `font-heading` significa Barlow Condensed, mas também estava aplicada a headings de modais. Sua especificidade podia superar a seleção de família por tag.
- O modal de candidatura e o modal legal usam portals em `document.body`; regras restritas a `#root` não cobriam seus títulos.
- Links da navegação mobile tinham override explícito para Anton, contrariando o papel de interface solicitado.
- O texto promocional “GENTE BOA FAZ BURGER BOM.” estava marcado como tipografia auxiliar.

## B. Arquivos e alterações realizadas

| Arquivo de aplicação | Alteração restrita à tipografia |
| --- | --- |
| `src/index.css` | Tokens oficiais preservados no ponto global; aliases Tailwind v4; literais de componentes antigos substituídos por variáveis; remoção de `!important` das famílias; prioridade semântica dos títulos, inclusive em portals |
| `src/components/LocationsSection.css` | Remoção do import Bricolage/Gabarito, tokens locais e overrides redundantes; títulos em peso 400; preservação da quebra no tablet |
| `src/components/LocationsSection.tsx` | Um `<br>` responsivo no título para conservar a quebra anterior entre “ONDE NOS” e “ENCONTRAR” no tablet |
| `src/components/HeroAnimation.css` | Apenas a família literal do título passa a usar o token; nenhuma propriedade de animação alterada |
| `src/components/Navbar.css` | Famílias e shorthands usam o token secundário; navegação mobile e controles em Barlow Condensed |
| `src/components/TBHSpecularButton.css` | Família passa a usar o token secundário |
| `src/components/burger-menu/BurgerShowcase.css` | Título e nomes usam o token principal; demais regras, incluindo os ajustes locais mais recentes de grade e stickers, preservadas |
| `src/components/RecruitmentSection.tsx` | O destaque promocional passa de `font-heading` para `font-display`; sem mudar texto, tamanho ou estrutura |

Também foram criados este relatório e scripts/evidências em `audit/typography-2026-11-03/`. Nenhum asset, arquivo de fonte, dependência, configuração de produção ou regra de negócio foi alterado. `scope-verification.json` registra os oito arquivos de aplicação modificados; os demais arquivos e assets existentes foram preservados por comparação SHA-256.

## C. Design system final

Ponto único das famílias: `src/index.css`.

```css
:root {
  --tbh-font-title: "Anton", Impact, sans-serif;
  --tbh-font-description: "Barlow Condensed", sans-serif;
}
```

| Papel | Token/alias | Família |
| --- | --- | --- |
| Headings H1–H6, `role="heading"`, `.font-display`, `.tbh-unified-title` | `--tbh-font-title`, `--font-display` | Anton 400 |
| Corpo, descrições, contatos, preços, formulários e controles | `--tbh-font-description` | Barlow Condensed |
| `.font-heading`, `.font-body`, `.font-sans` | `--font-heading`, `--font-body`, `--font-sans` | Barlow Condensed |

Headings semânticos têm prioridade sobre a classe auxiliar `font-heading`. Assim, um `h3.font-heading` é tratado como título Anton, enquanto um botão com a mesma classe continua Barlow. A regra também funciona em portals fora de `#root`. Nenhum peso inexistente foi solicitado para Anton; os títulos computados terminaram em 400.

O carregamento continua **exclusivamente em `index.html`**, que já tinha o link correto: Anton 400 e Barlow Condensed 400/500/600/700/800/900, com `display=swap` e preconnects. Os pesos secundários aparecem em classes/estilos próprios realmente utilizados — incluindo campos medium, estado semibold, textos bold e CTAs/badges extrabold/black. Não foi necessário editar o HTML nem criar outro carregador.

## D. Remoções e preservações

- Removido o único import CSS de Bricolage Grotesque/Gabarito.
- Removidas as duas redefinições locais dos tokens de família em Locations e seus fallbacks antigos.
- Eliminadas as 21 aplicações de `!important` em `font-family`; a auditoria final encontrou **zero**.
- Famílias literais ativas dos componentes substituídas por referências aos tokens oficiais.
- Nenhum binário de fonte ou branding removido. Não havia fonte local própria comprovadamente em uso para excluir.
- O antigo `BurgerFlipCard.css`, atualmente não importado pela vitrine, já usava os dois tokens com fallbacks oficiais. Foi inventariado e preservado; não introduz fonte adicional.
- O Tailwind JS legado da raiz não é a configuração do frontend Vite/Tailwind v4 atual. Não há `@config` que o carregue neste frontend; o tema atual é definido em CSS. Essa ocorrência de Gabarito não faz parte do bundle validado.

## E. Validações reais

### Técnica e navegador

- `npm run lint`: TypeScript aprovado.
- `npm run build`: aprovado após a alteração final. Permanece o aviso anterior de `__dirname` na configuração Vite; não foi ocultado nem alterada essa configuração.
- Sete testes existentes de catálogo, cálculo de totais, formulário e parser de ingredientes: aprovados.
- Auditoria estática final: nenhuma referência a Bricolage/Gabarito nos arquivos de interface ativos do frontend; nenhum import de fonte em componente.
- Um único pedido de stylesheet Google Fonts por carregamento de página, contendo somente Anton e Barlow Condensed. Sem requisição às famílias removidas nos sete cenários.
- Estilos computados de todos os títulos capturados: Anton, peso 400. Textos auxiliares e interface capturados: Barlow Condensed.
- CDP confirmou a fonte realmente usada, e não apenas declarada: Anton em Sobre, produtos e Locations; Barlow Condensed no endereço. Na Hero com movimento normal, a primeira letra da entrada usa `Anton-Regular`, com `isCustomFont: true`.

### Antes/depois e geometria

Capturas de Hero, Sobre, favoritos, Locations, carreiras, Footer, cardápio completo, sacola e candidatura foram feitas antes e depois nos viewports:

| Viewport | Alturas/larguras das seções | Tamanhos de fonte comparados | Novo overflow horizontal/textual detectado | Erros JavaScript capturados |
| --- | --- | --- | --- | --- |
| 1920 × 1080 | Preservados | Preservados | 0 | 0 |
| 1440 × 900 | Preservados | Preservados | 0 | 0 |
| 1366 × 768 | Preservados | Preservados | 0 | 0 |
| 1024 × 768 | Preservados | Preservados | 0 | 0 |
| 768 × 1024 | Preservados após ajuste abaixo | Preservados | 0 | 0 |
| 390 × 844 | Preservados | Preservados | 0 | 0 |
| 375 × 667 | Preservados | Preservados | 0 | 0 |

Em 768 px, a Anton inicialmente fez o título de Locations passar de duas linhas para uma, reduzindo a seção em aproximadamente 77 px. Foi inserida somente uma quebra responsiva entre “ONDE NOS” e “ENCONTRAR” no intervalo **640–1023 px**, usando os limiares já existentes. Isso restabeleceu a altura anterior sem reduzir fonte, mudar espaçamentos ou reservar uma linha vazia. Fora desse intervalo, o `<br>` não é renderizado. Esse é o único ajuste de layout decorrente da troca de fontes.

O contrato CSS compara todas as declarações não relacionadas a família/peso/shorthand tipográfico. A única diferença restante é o par `display: none/block` dessa quebra. Tamanhos de fonte, entrelinhas, margens, paddings, gaps, grids, cores, propriedades de imagens, transforms e keyframes preexistentes ficaram intactos. A mudança de uma classe do destaque promocional também é exclusivamente tipográfica.

O estado atual de Locations já continha fundo azul, título amarelo alinhado à esquerda e mascote estático em um bloco posterior de estilos. Esse estado dos arquivos foi preservado, conforme a orientação de alterar apenas fontes. A fotografia e os clipes do mascote não foram modificados.

### Interfaces adicionais e animações

Em 1440 e 375 px, foram abertos e verificados: formulário de checkout, fidelidade, privacidade e navegação mobile (quando aplicável). Títulos, labels, inputs, botões e links passaram nas verificações de família. Nenhum formulário foi enviado, pedido criado, contato disparado ou pagamento iniciado; os testes bloquearam métodos HTTP de escrita.

Na Hero com movimento normal, em 1440 e 375 px: entrada concluída, 19 caracteres animados, quatro ingredientes presentes e vídeo carregado com `readyState: 4`. Nenhum código de timeline, partículas, brasas ou mascote foi modificado. A captura do vídeo já estava no estado de pausa previsto por seu componente ao final da entrada; não se alegou reprodução contínua nova.

### Evidências

Pasta `audit/typography-2026-11-03/`:

- `source-inventory-before.json`, `before-manifest.json`, `scope-verification.json`.
- `before.json`, `after.json`, `comparison.json`: fontes, medidas e comparação automática.
- `css-contract-before.json`, `css-contract-after.json`: propriedades CSS e preservação do escopo.
- `extra-interfaces.json`: checkout e modais, estilos computados e fontes reais por CDP.
- `hero-smoke.json`: verificação da entrada da Hero com movimento normal.
- `before-<largura>-<seção>.png` e `after-<largura>-<seção>.png`: capturas equivalentes; o `after-768-locations.png` foi atualizado após a correção da quebra.

## F. Pendências e limites

- Testes visuais em Chromium com emulação mobile; não equivalem a testes em Safari ou aparelhos físicos. Diferenças de antialiasing por sistema operacional continuam possíveis.
- Não há tela administrativa nesse frontend para validar. O ponto de entrada administrativo legado e as configurações do projeto externo permaneceram intactos.
- Componentes não montados pelo App, como InstagramCommunity, ReviewSection, JoinTeamSection e o flip antigo, foram inspecionados no código, mas não apresentados como telas testadas no navegador.
- Persistem problemas já existentes de empilhamento da navbar sobre o topo de alguns modais/sacola em telas pequenas. Há capturas anteriores e posteriores; não são novos overflows da troca de fonte. Corrigir z-index/posicionamento desses componentes ultrapassaria a padronização tipográfica e não foi feito.
- O conteúdo legado de checkout/termos e os dados provisórios de contato não foram corrigidos nesta tarefa de fontes.
- Google Fonts continua sendo uma dependência de rede já existente. Os tokens incluem fallback; o teste confirmou o carregamento real das duas famílias oficiais.

Sem backup automático, instalação, commit, push, deploy, alteração de backend, PagBank ou produção.
