# The Burger House 2.0 · Estabilização final do frontend

7 de novembro de 2026 · build de produção executado localmente

## Resumo executivo

A Hero passou a entregar título e pôster no HTML inicial. O LCP mediano foi **0,072 s no desktop** e **1,048 s no mobile limitado**, com CLS abaixo de 0,1 nas seis navegações. As 15 fotos do cardápio passaram a usar variantes responsivas de WebP com transparência. A revisão também corrigiu a devolução de foco no detalhe e uma corrida que podia sobrescrever a sacola durante a inicialização.

### Pendências de entrada

- F03 parcial por LCP móvel acima de 2,5 s e falta de atribuição do custo inicial a funções específicas.
- A07 ainda transferia fotos de produtos próximas de 2 MB cada. A validação do mapa anterior cobria apenas a falha.
- Faltavam uma segunda engine de navegador, teste de reflow equivalente a 200%, regressões de timeout e formato inválido do catálogo e nova confirmação independente dos achados anteriores.
- Compatibilidade com dispositivo físico, leitor de tela, cartografia ao vivo e métricas de campo permanecia fora da evidência. Os relatórios anteriores foram preservados. [Auditoria original](frontend-design-audit.md) · [Remediação anterior](frontend-audit-remediation.md).

## F03 · Causa e intervenção

O pôster já chegava antes do JavaScript, mas o HTML entregava uma raiz React vazia. O navegador só conseguia pintar título e pôster depois de carregar, avaliar e montar a Home completa. Na amostra diagnóstica prévia a esta intervenção, o pôster chegou em 1,713 s, o bundle de 491 kB terminou em 3,948 s e o LCP foi 6,620 s. O trace mostrou um layout individual de 1,257 s e uma tarefa de 1,824 s. O perfil de CPU, cruzado com posições no bundle, apontou `dc` do ScrollTrigger, que insere um elemento para ler `offsetHeight`, e `ji`, caminho do GSAP que consulta `getComputedStyle`. O script de observação antigo também consultava layout por frame antes do título. A medição final usa um observador de inserção do título sem leituras geométricas repetidas. [Trace de diagnóstico](../test-results/frontend-stabilization-baseline-oGg6GN/mobile-baseline.trace.json.gz) · [Perfil de CPU](../test-results/frontend-stabilization-baseline-oGg6GN/mobile-baseline.cpuprofile).

O Vite gera HTML para a primeira pintura a partir dos mesmos componentes React de título e pôster e dos mesmos estilos usados na Hero interativa. A navegação e as camadas animadas entram quando o bootstrap monta a aplicação. O registro explícito de ScrollTrigger foi deslocado para a preparação das animações após a primeira pintura, respeitando a preferência por movimento reduzido. O pôster permanece até o primeiro quadro apresentado. O vídeo manteve o asset e a animação aprovados. O teste com JavaScript desativado comprova a independência da primeira pintura. [HeroArtwork.tsx](../frontend/src/components/HeroArtwork.tsx) · [vite.config.ts](../frontend/vite.config.ts) · [mountStorefront.tsx](../frontend/src/mountStorefront.tsx).

### Medições comparáveis

Chromium headless 156.0.8078.4, build Vite servido no loopback sem gzip, cache desativado, contexto novo por amostra e fontes públicas permitidas. As APIs foram bloqueadas. Desktop 1440×900 sem limitação. Mobile 390×844, DPR 3, CPU 4×, latência de 150 ms, download de 200.000 B/s e upload de 93.750 B/s. Três amostras por perfil, com trace na primeira de cada perfil. Os tempos contam da navegação. CLS usa a maior janela de sessão observada.

| Perfil | LCP original | LCP da remediação anterior | LCP final individual | LCP mediano | CLS final |
| --- | ---: | ---: | --- | ---: | --- |
| Desktop | 3,188 s | 0,940 s | 0,084 / 0,064 / 0,072 s | **0,072 s** | 0,0455 / 0,0455 / 0,0455 |
| Mobile limitado | 11,056–13,664 s | 7,688–8,200 s | 1,012 / 1,048 / 1,408 s | **1,048 s** | 0,0239 / 0,0239 / 0,0239 |

O pôster foi o último candidato LCP em todas as amostras. A comparação anterior com gzip, de 4,988 s no mobile, usava outra configuração de transporte. Os tempos muito baixos de desktop refletem o servidor local. Cinco amostras ficaram sem tarefas acima de 50 ms antes do LCP. A terceira amostra móvel registrou uma tarefa de 133 ms antes do LCP. A rodada de desempenho precedeu os últimos ajustes de foco e usou o mesmo HTML crítico e caminho de entrega da Hero. O JavaScript da aplicação ainda exige transferência, montagem e layout após a primeira pintura. A medição valida o orçamento visual inicial, sem medir disponibilidade interativa em campo. A animação do mascote terminou em 2,042 s nas capturas desktop. A janela de 10,5 s das amostras móveis limitadas registrou o pôster e a carga do vídeo, incluindo um cancelamento de requisição pelo Chromium. [Medições e lista de recursos](../test-results/frontend-final-performance-XssQ2z/measurements.json) · [Trace desktop](../test-results/frontend-final-performance-XssQ2z/desktop-1.trace.json.gz) · [Trace mobile](../test-results/frontend-final-performance-XssQ2z/mobile-1.trace.json.gz).

## Mídia e proteção visual

- Os 15 originais de produtos totalizam 17.461.666 bytes. As variantes de 384 px totalizam 572.016 bytes (−96,7%) e as de 768 px, 1.988.664 bytes (−88,6%). A seleção por `srcset` considera a largura de exibição na vitrine, lista e detalhes. Sacola e revisão usam tamanhos adequados às miniaturas. Os caminhos originais continuam no catálogo e os arquivos-fonte foram preservados. [Dados de decodificação e dimensões](../test-results/frontend-final-performance-XssQ2z/product-media.json).
- A foto de Carreiras passou de 1.780.332 para 229.430 bytes. O mascote do cardápio, o de Carreiras e o do rodapé passaram a 48.738, 64.298 e 68.950 bytes. A logo menor já usada na navbar passou a atender o rodapé. Pôster, ingredientes e fotografias da galeria reutilizam as variantes da etapa anterior.
- O menu passou a usar miniaturas das mesmas fotos nos ícones de categoria. A validação compara o produto identificado no card com a variante carregada e confirma decodificação em todos os tamanhos. Enquadramento e regras de layout das fotos foram preservados. [Hero desktop](../test-results/frontend-final-performance-XssQ2z/desktop-2.png) · [Hero mobile](../test-results/frontend-final-performance-XssQ2z/mobile-2.png).

## Matriz de verificação

Os cenários estão em [checkout.spec.ts](../tests/integration/checkout.spec.ts) e [frontend-audit.spec.ts](../tests/integration/frontend-audit.spec.ts). Os riscos indicados se referem à cobertura da verificação local.

| ID | Causa original | Correção e arquivos relevantes | Resultado automatizado e no navegador | Limite | Status |
| --- | --- | --- | --- | --- | --- |
| F01 | Dados estáticos na vitrine e catálogo separado na sacola | Mantido catálogo compartilhado em `useStorefrontCatalog.ts`, `App.tsx` e `useCheckout.ts`. Persistência do carrinho só após mudança de estado. | O Praiano a R$ 51,90 em vitrine, cardápio, detalhe e sacola, Crispy inativo, preço alterado na revisão, vazio, timeout, 503, preço inválido, retry e restauração de quantidades. | API e pagamento simulados. | FIXED AND VERIFIED |
| F02 | Reutilização do botão de avanço como submit | Botões de tipos e chaves distintos em `OrderDrawer.tsx`. | Um clique foca Identificação sem submit. A revisão intencional anuncia e foca o primeiro erro. | Teclado virtual físico fora da amostra. | FIXED AND VERIFIED |
| F03 | O primeiro conteúdo dependia da montagem React e dos efeitos | Pré-renderização compartilhada, bootstrap menor e preparação GSAP adiada. `vite.config.ts`, `main.tsx`, `mountStorefront.tsx`, `HeroArtwork.tsx`, `HeroSection.tsx`, `HeroMascot.tsx`, `HeroSmokeTransition.tsx`, `useScrollEntrance.ts` e `AboutAccordionGallery.jsx`. | Título e pôster sem JavaScript, seis LCP dentro da meta, desktop com animação completa e movimento reduzido com pôster. | Tempo interativo e dados de campo fora do objetivo de LCP local. | FIXED AND VERIFIED |
| F04 | Abas sem navegação e vínculo completos | Padrão de abas e devolução ao acionador exato em `MenuProductCard.tsx` e `FullMenuModal.tsx`. | Setas, Home, End, Tab, `aria-controls` e retorno ao acionador testados. | Sem leitor de tela físico. | FIXED AND VERIFIED |
| F05 | Compra abaixo de todo o conteúdo nutricional | Faixa independente em `FullMenuModal.tsx` e `FullMenuModal.css`. | CTA permaneceu visível ao rolar até a ressalva nutricional nos oito tamanhos. | Amostra com O Praiano. | FIXED AND VERIFIED |
| F06 | Descrição tratada como ingrediente e mensagem de personalização indevida | Mantida a distinção entre Descrição e Ingredientes em `FullMenuModal.tsx` e `MenuProductCard.tsx`. | Acompanhamento tem Descrição. Hambúrguer tem Ingredientes. Nove testes nutricionais passaram. | Conteúdo editorial e rótulos de fornecedor fora do escopo. | FIXED AND VERIFIED |
| F07 | Quebra de “Acompanhamentos” a 320 px | Rótulo visual compacto e nome acessível completo em `FullMenuModal.tsx` e `FullMenuModal.css`. | Toque, estado selecionado, contagem de itens e largura da aba verificados. | Medidas em CSS pixels. | FIXED AND VERIFIED |
| F08 | Ausência de atalho para conteúdo | Mantidos link de salto e landmark em `App.tsx`, `LandingScroll.tsx` e `privacy.html`. | Tab inicial e Enter na Home e na privacidade, com foco no landmark. | Foco examinado por navegador automatizado. | FIXED AND VERIFIED |
| F09 | Moeda com convenções diferentes na lista e na sacola | Formatador comum de BRL em `utils/menu.ts`. | PT e EN conferidos em vitrine, menu e sacola, com checkout simulado. | Preços de fixture. | FIXED AND VERIFIED |
| F10 | Controles expostos enquanto o mapa falhava | Região inerte até carga bem-sucedida em `LocationMap.tsx`. | Estilo cartográfico local em WebGL habilitou zoom até o limite e popup. HTTP 403 induzido deixou o texto acessível e escondeu controles. | Tiles reais e configuração da conta fora da amostra. | FIXED AND VERIFIED |
| A01 | Recorte inicial da foto deixava uma faixa de 6% | Recorte de 9% por borda em `useScrollEntrance.ts`. | Transição de recorte inicial para foto inteira confirmada. | Interpolação observada no Chromium. | FIXED AND VERIFIED |
| A02 | Competição visual em Carreiras e diálogo inconsistente | Hierarquia, raio e rolagem preservados em `RecruitmentSection.css`; imagem derivada em `RecruitmentSection.tsx`. | Abertura, foco no nome, Escape e retorno ao CTA. | Avaliação de densidade visual é qualitativa. | FIXED AND VERIFIED |
| A03 | Âncora concorria com o cabeçalho fixo | Offset fixo e foco no título em `landingNavigation.ts` e `Navbar.tsx`. | Clique desktop e mobile manteve o título da unidade abaixo da navbar. | Âncora da unidade amostrada. | FIXED AND VERIFIED |
| A04 | Cabeçalho e rodapé comprimiam identificação | Rodapé compacto em `OrderDrawer.css`. | Campo focado fica acima do rodapé, inclusive a 320×568. | Teclado virtual físico fora da amostra. | FIXED AND VERIFIED |
| A05 | Unidade nutricional quebrava separadamente do valor | Agrupamento em `NutritionFacts.css`. | Tabela com nome acessível e sem overflow em oito tamanhos. | Amostra com O Praiano. | FIXED AND VERIFIED |
| A06 | Foco podia circular por controles inativos e mídia iniciava em movimento reduzido | `useModalFocus.ts` e controle de Hero. | Foco contido, restauração entre camadas e ausência de carga de vídeo em preferência reduzida. | Sem leitor de tela físico. | FIXED AND VERIFIED |
| A07 | Fotos pesadas e estados de oferta pouco claros | `productImage.ts`, `BurgerShowcaseItem.tsx`, `MenuProductCard.tsx`, `FullMenuModal.tsx`, `OrderDrawer.tsx`, `Footer.tsx`, `RecruitmentSection.tsx` e WebPs derivados. | Decodificação, seleção do `currentSrc` e estados de catálogo com compra bloqueada. | Cartografia e fotos de API ao vivo fora da amostra. | FIXED AND VERIFIED |

## Validação final

Os testes de integração usam somente fixtures locais de catálogo, entrega, pedidos, pagamentos e serviços administrativos. As verificações semânticas usaram os papéis e nomes acessíveis expostos pelo navegador e fluxos reais de teclado. A janela de 640×450 verifica o reflow equivalente a 200% de uma área de 1280×900. Zoom nativo, dispositivo iOS físico, teclado virtual e leitor de tela ficam fora das evidências. Axe e Lighthouse CLI não constavam das dependências disponíveis.

As oito resoluções da matriz são 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 375×667 e 320×568. As jornadas de idiomas exercitaram PT e EN, incluindo BRL e navegação da unidade. Nenhuma publicação, gravação em produção ou operação financeira real integrou a validação.

- TypeScript, build Vite e empacotamento estático local aprovados. Os avisos de tamanho do mapa adiado e seu worker permanecem registrados.
- 9 testes unitários e 9 testes de nutrição aprovados.
- Chromium com **50 testes aprovados** e 10 casos deliberadamente omitidos no projeto mobile, pois as respectivas medições já usam a matriz de viewports ou WebGL desktop. Sem falhas na rodada final. [Relatório Playwright Chromium](../test-results/playwright-runs/integration-eb7y34/report.json).
- WebKit no Windows com **11 testes aprovados**, incluindo as oito resoluções. O sucesso cartográfico com WebGL e a medição de recorte da galeria foram executados no Chromium. [Relatório Playwright WebKit](../test-results/playwright-runs/integration-mPOF8G/report.json).
- A verificação complementar confirmou o vídeo em reprodução com largura nativa de 516 px no desktop e em mobile emulado sem limitação, hover e toque na vitrine, um único H1 e as seções da Home. As amostras renderizadas de contraste deram 4,51:1 no aviso de Carreiras, 16,17:1 no botão da vitrine em repouso e 13,26:1 no CTA da navbar. [Verificação complementar](../test-results/frontend-final-performance-XssQ2z/interaction-checks.json).
- O FFprobe validou as dimensões e o alfa nas 30 variantes de produto. A comparação de O Praiano a 768 px, após redimensionar o original à mesma largura, registrou 31,76 dB no conjunto e 64,31 dB no alfa.
- A foto e o mascote de Carreiras e a logo e o mascote do rodapé decodificaram no Chromium a 1440 e 390 px. [Dimensões no navegador](../test-results/frontend-final-performance-XssQ2z/landing-media-checks.json) · [Captura de Carreiras em 390 px](../test-results/frontend-final-performance-XssQ2z/careers-decoded-390.png).

O WebKit esperado pela versão atual do Playwright exigia a revisão 2370. A rodada de compatibilidade usou a revisão 2336 já instalada no Windows. As regressões revelaram diferenças de foco em cliques, na navegação por Tab de links e na troca de abas. Os acionadores dos diálogos passaram a receber foco explícito, os dois atalhos de conteúdo receberam `tabindex="0"` e a troca por teclado passou a focar a nova aba no quadro seguinte à atualização do DOM. A aba focada rola para a área visível quando necessário. O teste de Tab aguarda a montagem da interface, pois o H1 já está disponível antes dela.

## Reavaliação pela rubrica original

| Dimensão | Auditoria inicial | Remediação | Estabilização |
| --- | ---: | ---: | ---: |
| Identidade e consistência | 17/20 | 17/20 | 17/20 |
| Layout e composição | 12/15 | 14/15 | 14/15 |
| Usabilidade | 10/15 | 14/15 | 15/15 |
| Responsividade | 12/15 | 14/15 | 14/15 |
| Tipografia e leitura | 8/10 | 9/10 | 9/10 |
| Movimento | 7/10 | 8/10 | 8/10 |
| Acessibilidade | 6/10 | 8/10 | 9/10 |
| Desempenho visual | 2/5 | 3/5 | 4/5 |
| **Total** | **74/100** | **87/100** | **90/100** |

A nota considera a correção da persistência, as novas verificações de foco e reflow e o LCP dentro da meta de laboratório. Há cobertura parcial de tecnologia assistiva e o custo de inicialização interativa ainda merece acompanhamento em campo.

## Decisão de encerramento

**Aprovado para encerrar o redesign e a estabilização no escopo do frontend local.** Os 17 itens da matriz foram reverificados nesse escopo. O F03, que impedia o encerramento anterior, passou na meta de LCP em todas as amostras. As correções de teclado passaram nas duas engines testadas e a suíte de catálogo e checkout passou com serviços simulados.

A decisão cobre o build local. Aferição de campo, Safari/iOS físico, leitor de tela, teclado virtual e serviços ao vivo permanecem como validações externas à rodada.
