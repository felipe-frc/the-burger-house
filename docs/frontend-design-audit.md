# Auditoria independente de frontend e UX — The Burger House 2.0

**Data:** 7 de novembro de 2026\
**Escopo:** vitrine pública React, navegação, cardápio, detalhes e nutrição, sacola e revisão de pedido.\
**Decisão:** **NÃO APROVADO PARA ENCERRAMENTO — 7,4/10.**\
**Confiança:** alta nos defeitos reproduzidos e na cobertura de Chromium. Moderada na nota global, pela ausência de dados de campo, auditoria automatizada de acessibilidade e validação em aparelhos físicos.

## A. Resumo executivo

A vitrine já tem uma linguagem reconhecível, e a composição estável da Hero, a galeria, as fotografias recortadas e o cardápio formam uma experiência visual coesa. O catálogo apresentou 15 produtos com imagens funcionais em todas as oito resoluções. O cardápio, o detalhe e a sacola puderam ser navegados sem rolagem horizontal da página.

Três resultados impedem o encerramento. **O cardápio anuncia preço e disponibilidade de dados estáticos, enquanto a sacola usa o catálogo atual.** No teste de divergência, um produto mudou de R$ 43,90 para R$ 51,90 após ser adicionado, e um produto inativo aceitou inclusão. **Um clique em Continuar dispara a validação da etapa seguinte antes de o usuário digitar.** Aconteceu em desktop e mobile. **A entrada e o carregamento da Hero falharam no orçamento de desempenho do laboratório**, com LCP de 3,19 s no desktop local e duas observações acima de 11 s no cenário móvel limitado. Esses valores são de laboratório, com condições descritas na seção F.

Também há problemas no acesso por teclado às abas de detalhes, no alcance do CTA durante a leitura nutricional e na hierarquia em 320 px. Nenhum desses achados pede uma revisão geral da identidade visual.

### Método e limites

- Leitura dos componentes React/TypeScript, estilos, imagens, utilitários e configuração Vite. O alvo foi o frontend atual em [frontend/](../frontend), sem revisão do admin, do backend, do banco ou do processamento de pagamentos.
- Chromium headless com Vite local, em contextos novos, nas oito dimensões solicitadas. Toque emulado nas larguras de tablet e telefone, com viewport móvel nos telefones. O catálogo foi simulado a partir dos 15 itens de referência do código. Uma segunda simulação alterou preço e disponibilidade para testar divergência. As capturas foram temporárias e usadas na revisão visual.
- Foram bloqueadas as operações de escrita e as integrações externas da loja. As fontes do Google puderam carregar nos testes principais. O mapa foi inspecionado no estado de falha induzida. Dados de identificação sintéticos foram preenchidos somente até a tela de revisão. Nenhum pedido foi enviado e nenhum pagamento foi iniciado.
- **Observado** significa reproduzido no navegador. **Código** indica evidência estática. **Juízo visual** é avaliação editorial. Limitações constam separadamente e não contam como verificações aprovadas.

## B. Nota por categoria

| Categoria | Nota | Fundamentação da dedução |
| --- | ---: | --- |
| Identidade visual e consistência | 17/20 | A identidade gastronômica é reconhecível da Hero ao rodapé. A passagem entre galeria, vitrine e faixa gráfica é menos coesa durante a entrada animada. O modal de Carreiras tem acabamento diferente do cardápio, e a mistura de decoração, selo e frase sobre a foto eleva a densidade dessa seção. |
| Layout e composição | 12/15 | O grid de produtos e o equilíbrio de imagem e texto funcionam no desktop. O detalhe deixa o CTA no fim do conteúdo nutricional, e a área fixa do checkout ocupa uma parte importante da altura em 320 × 568. |
| Experiência e usabilidade | 10/15 | Navegação, categorias, alteração de quantidade e revisão são utilizáveis. As perdas vêm do preço/disponibilidade divergentes, da validação prematura e da mensagem sobre personalizações que não estão disponíveis. |
| Responsividade | 12/15 | Oito dimensões sem rolagem horizontal da página e 15 imagens carregadas por dimensão. A aba de acompanhamentos quebra dentro da palavra em 320 px. O detalhe pede rolagem longa, e Safari/iOS e teclado virtual real ficaram sem verificação. |
| Tipografia e legibilidade | 8/10 | Anton dá hierarquia e Barlow Condensed sustenta a leitura. A tabela nutricional usa uma tipografia mais neutra adequada ao dado. A compressão dos rótulos em 320 px e a concorrência de texto com imagem em Carreiras reduzem a consistência. |
| Animações e interações | 7/10 | A direção criativa e o toque na vitrine funcionam. A Hero pode ocultar texto durante a entrada, e a foto da galeria aparece temporariamente numa fenda estreita. A leitura das receitas funciona quando a interação estabiliza. |
| Acessibilidade | 6/10 | Fechamento, devolução do foco, foco visível em controles amostrados e movimento reduzido são pontos positivos. Abas internas incompletas, ausência de atalho inicial para o conteúdo e cobertura limitada de tecnologia assistiva reduzem a nota. |
| Desempenho visual | 2/5 | CLS baixo nas amostras, mas LCP elevado e variável, vídeo de 5,13 MB no desktop e mídia grande. Ausência de medição de campo e de Lighthouse. |
| **Total** | **74/100** | **7,4/10** |

## C. Homepage, seção por seção

| Área | Avaliação | Evidência e ressalva |
| --- | --- | --- |
| Navbar | Identidade clara, logo central e amarelo reservado à ação de pedido. No mobile, navegação, idioma e sacola permanecem identificáveis. | Navegação, abertura do cardápio e foco de retorno observados. Ao tocar em Unidade a 390 px, o título da seção ficou abaixo do cabeçalho fixo. Nos oito tamanhos, a primeira tecla Tab entrou nos controles do cabeçalho. A inspeção do [App](../frontend/src/App.tsx) e do [contêiner principal](../frontend/src/components/LandingScroll.tsx) não encontrou um atalho para saltar ao conteúdo. |
| Hero | Em repouso, o título em duas linhas no desktop e quatro no mobile mantém hierarquia. O mascote é o foco e os ingredientes ficam nas laterais. Em 320 × 568, as quatro palavras e o mascote estavam visíveis na captura estabilizada. | No primeiro carregamento houve uma captura com a área do título vazia. Na repetição móvel, perto de 2,61 s o primeiro caractere ainda estava transladado a 100%. Em 3,43 s já estava na posição final e em 4,04 s a entrada foi marcada como concluída. A sequência aguarda as fontes antes de aplicar o recorte animado. [HeroSection](../frontend/src/components/HeroSection.tsx#L26) |
| Transição Hero → Sobre e faixa | A mudança de azul para porcelana separa os blocos com clareza. A fumaça e a faixa são coerentes com o tema gastronômico. | Foram vistos os estados durante a rolagem e a composição estabilizada. As camadas de fumaça, movimento e brasas foram inspecionadas em código. A fluidez sob carga e a resposta a diferentes GPUs não foram medidas quadro a quadro. [HeroSmokeTransition](../frontend/src/components/HeroSmokeTransition.tsx) · [PatternRibbon](../frontend/src/components/PatternRibbon.tsx) |
| Sobre e galeria | Título e texto em colunas no desktop, empilhados no celular. A foto ativa ganha espaço suficiente depois da entrada e o texto da seção conserva boa leitura. | Em captura intermediária, a foto da fachada apareceu como uma faixa horizontal estreita com grandes áreas escuras. Em captura estabilizada, a foto preencheu o painel. A seta direita moveu o foco entre os cartões em desktop e 390 px. A composição final funciona, mas a revelação interrompe momentaneamente a leitura visual da foto. [AccordionGallery](../frontend/src/components/AccordionGallery.jsx) |
| Seu próximo favorito | A fotografia e o nome do produto dominam a composição. Preço, compra e acesso ao cardápio completo são distinguíveis. O texto de ingredientes permanece legível porque usa uma camada sem filtro e sem rotação. | Hover em 1440 px e toque em 390 px revelaram ingredientes. Segundo toque fechou o painel. A imagem gira, enquanto o texto entra por opacidade com atraso. O rótulo de calorias estimadas apareceu como texto. O preço da vitrine também vem da lista estática. [BurgerShowcaseItem](../frontend/src/components/burger-menu/BurgerShowcaseItem.tsx#L21) · [Estilos da vitrine](../frontend/src/components/burger-menu/BurgerShowcase.css#L12) |
| Onde nos encontrar | O título amarelo e o painel inferior criam hierarquia clara, e a unidade é identificada como conceitual. A composição mantém os dados e as ações legíveis mesmo sem o mapa. | Com a requisição MapTiler bloqueada no teste, a interface mostrou uma mensagem de erro localizada na área cartográfica e conservou o aviso de localização ilustrativa. Os controles de zoom continuaram visíveis nesse estado, embora sem mapa útil. O serviço externo, pin e zoom com tiles reais ficaram fora da confirmação. [LocationsSection](../frontend/src/components/LocationsSection.tsx#L30) · [LocationMap](../frontend/src/components/LocationMap.tsx) |
| Carreiras | A ordem visual é título, mensagem, CTA e fotografia. O aviso de candidatura demonstrativa é visível. Foto, frase amarela e mascote competem mais no quadrante da foto do que nas demais seções. | Capturas em desktop e mobile confirmam o empilhamento e o CTA visível. A 390 px, o diálogo focou o campo de nome e devolveu o foco ao CTA ao fechar com Escape. A densidade da foto é juízo visual, não bloqueio. [RecruitmentSection](../frontend/src/components/RecruitmentSection.tsx#L39) |
| Rodapé e privacidade | Marca, navegação, fidelidade, WhatsApp, idioma e privacidade estão organizados em grupos reconhecíveis. No mobile, os elementos ficam empilhados e sem estouro de largura. | Fidelidade abriu e devolveu o foco ao botão com Escape a 390 px. A política abriu localmente com HTTP 200, título próprio e retorno à loja. A página é em português, identificada por hrefLang no rodapé e por texto explícito no link inglês do checkout. WhatsApp externo e uso de contatos não foram executados. [Footer](../frontend/src/components/Footer.tsx#L29) · [Política](../frontend/public/privacy.html) |

## D. Cardápio completo, detalhes e sacola

**Lista e navegação.** A grade desktop de três colunas usa imagens à esquerda e texto à direita. Os nomes começam com alinhamento consistente e o botão amarelo de compra tem prioridade sobre o botão de detalhes contornado. Os três filtros retornaram **6 hambúrgueres, 3 acompanhamentos e 6 bebidas**. As 15 imagens de produto decodificaram com largura natural nas oito dimensões, totalizando 120 verificações de imagem. O foco inicial entrou no botão Fechar. As categorias superiores têm setas e vínculo entre aba e painel implementados. No mobile, a faixa de categorias fica fixa durante a rolagem do modal. Em 320 px, o texto “ACOMPANHAMENTOS” quebra antes do S final. [FullMenuModal](../frontend/src/components/FullMenuModal.tsx#L80) · [Estilos](../frontend/src/components/FullMenuModal.css#L98)

**Detalhes e nutrição.** Abrir O Praiano levou o foco a Voltar aos produtos. Voltar devolveu o foco ao acionador de imagem do item, preservando uma referência útil ao produto. As abas de Ingredientes e Informações nutricionais abriram por clique. Em todas as oito dimensões, a seta direita pressionada na primeira aba não mudou foco nem seleção, e o painel visível não tinha rótulo associado. A tabela de O Praiano apresentou 10 linhas incluindo cabeçalho, título de tabela, cabeçalhos por linha e coluna e aviso de valores estimados. Medidas da tabela: 428 px em desktop, 312 px em 390 e 242 px em 320, com scrollWidth igual à largura medida. Os dados continuaram legíveis, embora o layout estreito quebre a unidade de alguns nutrientes para a linha seguinte. A validação editorial de todos os ingredientes, alergênicos e rótulos de fabricantes ficou fora da execução. Nos acompanhamentos e bebidas, a implementação reutiliza a descrição no painel de ingredientes. [MenuProductCard](../frontend/src/components/MenuProductCard.tsx#L62) · [NutritionFacts](../frontend/src/components/NutritionFacts.tsx#L124) · [Conversão dos demais produtos](../frontend/src/components/FullMenuModal.tsx#L66)

**Preço, ação e rolagem.** Nos cartões, o preço aparece antes de Adicionar. Nos detalhes com nutrição aberta, preço e compra ficam depois da tabela e dos avisos, sem barra fixa. Na primeira leitura de O Praiano, o botão estava abaixo do viewport nas oito dimensões. Por exemplo, o topo medido foi y = 1.631 px em 1440 × 900 e y = 1.862 px em 320 × 568. Após rolar, o botão de 111 × 44 px ficou visível e acionável. A lista/detalhe usa preços compilados, e a sacola consulta o catálogo. Na simulação de mudança, esse desenho produziu um preço diferente e permitiu adicionar um item inativo até a etapa da sacola. [MenuProductCard](../frontend/src/components/MenuProductCard.tsx#L48) · [Modelo da sacola](../frontend/src/checkout/model.ts#L22)

**Sacola e revisão.** Depois de Adicionar, o cardápio ficou inerte e a sacola recebeu foco em Fechar pedido. Aumentar quantidade atualizou de 1 para 2. Escape fechou a sacola, devolveu o foco a Adicionar O Praiano e, ao fechar o cardápio, devolveu-o ao botão que o abriu ou ao controle da navegação móvel. A revisão foi atingida com dados sintéticos em 1440, 390 e 320 px. Na transição para Identificação, o primeiro clique em Continuar também disparou um evento de submit do formulário recém-renderizado. Isso marcou quatro campos vazios antes da primeira digitação. A validação intencional, depois de preencher o formulário, permitiu revisar o pedido. O botão Ir para pagamento ficou sem acionamento. [OrderDrawer](../frontend/src/components/OrderDrawer.tsx#L155) · [Controle de etapas](../frontend/src/checkout/useCheckout.ts#L129) · [Gerenciamento de foco](../frontend/src/utils/useModalFocus.ts)

**Idioma e estados.** A troca PT → EN atualizou o lang da página e o conteúdo do cardápio em desktop e pela navegação mobile. A interface em inglês ainda exibiu preço com vírgula no cardápio e com ponto na sacola. Ambos identificam BRL, mas usam convenções diferentes dentro do mesmo pedido. Foram observados o alerta de item indisponível e o bloqueio de Continuação. Os estados de erro da API, sacola vazia e endereçamento de entrega receberam leitura do código, sem cobertura completa de interação. [App](../frontend/src/App.tsx#L31) · [Preço do cartão](../frontend/src/components/MenuProductCard.tsx#L48) · [Preço da sacola](../frontend/src/components/OrderDrawer.tsx#L58)

## E. Auditoria responsiva

| Viewport | Verificações concluídas | Observação |
| --- | --- | --- |
| 1920 × 1080 | Home, categorias, imagens, detalhe, tabela, CTA após rolagem, Escape | Faixa de categorias de 1.356 px sem estouro; CTA nutricional fora da primeira vista. |
| 1440 × 900 | Fluxo anterior, hover, galeria, idioma, quantidade e revisão | Grade de três colunas equilibrada. A sacola usa painel lateral e preserva foco. |
| 1366 × 768 | Home, categorias, imagens, detalhe e foco de retorno | A região interna rola e torna o CTA alcançável. |
| 1024 × 768 | Home, categorias, imagens e detalhe em contexto com toque | Conteúdo cabe em largura. CTA exige rolagem interna. |
| 768 × 1024 | Home, navegação móvel, categorias, imagens e detalhe | O layout da vitrine fica mais alto no modo empilhado, sem estouro. |
| 390 × 844 | Home, idioma móvel, toque na receita, categorias, nutrição, quantidade e revisão | Tabela de 312 px com leitura vertical. |
| 375 × 667 | Home, categorias, imagens, detalhe e Escape | CTA alcançável após rolagem. |
| 320 × 568 | Home estabilizada, categorias, nutrição, quantidade e revisão | Quebra do rótulo de categoria. Tabela de 242 px sem estouro. Cabeçalho e rodapé fixos reduzem a área útil da etapa de identificação. |

Em todos os oito casos, a largura de rolagem do documento foi igual à largura do viewport na Home e após fechar o cardápio. A faixa de categorias também não apresentou scrollWidth maior que clientWidth nas amostras. Isso não equivale a teste de zoom de 200%, teclado virtual nativo, Safari/iOS ou orientação deitada em um telefone físico.

## F. Acessibilidade, animação e desempenho

### Acessibilidade

- Controles amostrados de fechar, compra, sacola e idioma têm nomes acessíveis. Houve foco visível no formulário e restauração de foco ao sair dos níveis do cardápio.
- As abas superiores do cardápio implementam uma estrutura mais completa que a do detalhe. Na aba nutricional, setas, vínculo entre aba e painel e entrada única de foco precisam seguir o mesmo padrão. [W3C ARIA APG — Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- Em amostras de cores sólidas, porcelana sobre azul ficou em **4,54:1**, porcelana sobre tomate em **4,51:1** e preto sobre amarelo em **13,26:1**. A aba ativa de 12 px usa o primeiro par, com margem estreita sobre o mínimo de 4,5:1 para texto comum. Amarelo sobre azul ficou em **3,72:1**, suficiente para o título grande observado, mas inadequado para texto pequeno. As medições não abrangem estados sobre fotografia, antialiasing, foco ou todo o site. [WCAG 2.2 — contraste mínimo](https://www.w3.org/TR/WCAG22/#contrast-minimum)
- Sem Axe ou Lighthouse disponíveis na instalação local. Foram usados árvore de acessibilidade do Chromium, inspeção dos atributos, teclado e toque emulado. Não há alegação de conformidade WCAG. Leitor de tela real, zoom ampliado e navegação assistiva no mapa continuam sem confirmação.

### Movimento

| Antes | Depois proposto | Por quê |
| --- | --- | --- |
| O título sofre recorte e deslocamento depois da espera pelas fontes. | Manter o título legível desde a primeira pintura. Executar a revelação apenas quando a fonte estiver pronta a tempo, com alternativa estática em caso de atraso. | A sequência atual pode tornar a mensagem principal temporariamente invisível. |
| A imagem ativa da galeria passa por uma faixa estreita durante a revelação. | Manter o primeiro cartão legível e restringir o recorte a uma revelação curta e localizada. | A captura intermediária esconde a maior parte da foto que deveria ancorar a seção. |

**Veredito de movimento:** corrigir a entrada da Hero antes do encerramento. A fumaça, o recorte dos ingredientes e a revelação das receitas podem permanecer. O modo de movimento reduzido, verificado em 390 px, mostrou título com opacidade 1, vídeo pausado no tempo 0 e nenhuma animação CSS em execução no instante medido. O ponteiro da Hero é condicionado a mouse preciso e preferência de movimento. A vitrine também oferece gesto de toque. [HeroAnimation](../frontend/src/components/HeroAnimation.css#L71) · [Movimento do ponteiro](../frontend/src/components/useHeroPointerMotion.ts#L18)

### Desempenho

Medição de laboratório com o **build Vite servido localmente**, Chromium headless, contextos novos, cache desabilitado, sem interação durante a janela. Desktop sem limitação artificial. Mobile em 390 × 844, CPU 4×, 150 ms de latência, aproximadamente 1,6 Mb/s de download e 0,75 Mb/s de upload. Fontes externas permitidas e APIs da loja bloqueadas. A máquina e as fontes externas podem influenciar os números. A amostra móvel de duas execuções permite reproduzir o sintoma, sem estimar percentil real.

| Execução | Último candidato LCP observado | CLS acumulado | Observação |
| --- | ---: | ---: | --- |
| Desktop 1440 × 900 | 3,188 s | 0,047 | Poster do mascote. Três tarefas longas registradas na janela de 5,4 s. |
| Mobile limitada 1 | 13,664 s | 0,024 | Poster do mascote. Entrada concluída na janela de 15,0 s. |
| Mobile limitada 2 | 11,056 s | 0,024 | Candidato foi um SPAN. A conclusão da entrada ainda não estava registrada ao final da janela de 19,6 s. |

O alvo de referência é LCP ≤ 2,5 s e CLS ≤ 0,1, avaliado em campo no percentil 75. As três observações locais ultrapassaram o alvo de LCP, e os valores de CLS ficaram abaixo de 0,1 nas janelas. Não foi medido INP, nem foram usados CrUX, RUM ou Lighthouse. [Core Web Vitals](https://web.dev/articles/vitals)

Em desktop, o vídeo transparente transferiu cerca de **5,13 MB**. Na mesma amostra, a fachada transferiu **2,40 MB** e imagens de hambúrgueres ficaram próximas de **2 MB** cada. O bundle principal saiu com **516 kB minificados / 171 kB gzip**. O chunk separado do mapa saiu com **1,087 MB / 295 kB gzip**, além do worker de **519 kB minificados**. O mapa já usa carregamento adiado, e as imagens dos cartões do modal têm loading lazy, decodificação assíncrona e dimensões. Esses pontos devem permanecer. A mídia transferida e a dependência de fontes na entrada justificam nova medição após ajustes. A atribuição exata de cada atraso a rede, decodificação ou GSAP exigiria trace e não foi inferida como causa única. [Entrada HTML e fontes](../frontend/index.html#L12) · [Carregamento do mapa](../frontend/src/components/DeferredLocationMap.tsx) · [Imagem do card](../frontend/src/components/MenuProductCard.tsx#L31)

**Verificações técnicas.** TypeScript e build de produção passaram. Passaram 9 testes do comando do frontend e 9 testes nutricionais executados separadamente. O build avisou sobre chunks acima de 500 kB e uso de __dirname com o futuro carregador nativo do Vite. A suíte de integração que simula criação de pedidos e checkout não foi executada. Nenhum erro JavaScript não tratado ou HTTP 4xx/5xx local apareceu na varredura dos oito tamanhos. O erro de rede do MapTiler foi induzido. O detector estático Impeccable sinalizou apenas o uso de creme e não executou regras dependentes de DOM para a maior parte dos arquivos. A porcelana é uma cor deliberada da marca e não foi tratada como defeito.

## G. Elementos a preservar

- Contraste cromático e presença visual da Hero **quando estabilizada**, incluindo o mascote e os ingredientes periféricos.
- Composição da galeria de Sobre após a revelação e navegação por setas entre as imagens.
- Seis burgers sem selos no cardápio, com nomes alinhados e distinção entre visualizar detalhes e adicionar.
- Tabela nutricional sem rolagem horizontal nas larguras medidas, aviso visível de estimativa e estrutura semântica de tabela.
- Foco inicial, Escape, retorno ao acionador e uso de inert no cardápio enquanto a sacola está aberta.
- Avisos de conceito em Carreiras, mapa e retirada, e navegação para a política de privacidade.

## H. Achados priorizados

| ID e severidade | Local, evidência e dimensões | Impacto | Correção recomendada | Antes do encerramento |
| --- | --- | --- | --- | --- |
| F01 **ALTA** | Vitrine e cardápio mostram dados estáticos. Em 390 px, a fixture elevou O Praiano de R$ 43,90 para R$ 51,90 e desativou Crispy Cheddar. A lista continuou com o preço original e permitiu adicionar os dois. A sacola refletiu a fixture e bloqueou avanço do item inativo. [FullMenuModal](../frontend/src/components/FullMenuModal.tsx#L17) · [Vitrine](../frontend/src/components/burger-menu/BurgerShowcaseItem.tsx#L62) · [Catálogo](../shared/storefront/features/catalog/catalog.ts#L310) | O usuário descobre mudança de preço ou indisponibilidade só depois de escolher o item. | Unificar preço e disponibilidade antes de Adicionar. Indicar estado de carregamento ou preço estimado quando o catálogo não puder ser conferido. Preservar a conferência da sacola. | **Sim** |
| F02 **ALTA** | Sacola → Identificação. Em 1440, 390 e 320 px, um clique em Continuar gerou submit no formulário recém-renderizado, com submitter REVISAR PEDIDO. Quatro campos ficaram inválidos e o foco saltou ao nome. [OrderDrawer](../frontend/src/components/OrderDrawer.tsx#L210) | O formulário abre com erros e, no celular estreito, a rolagem pode ocultar a seleção de modalidade. | Separar os controles de avançar e enviar entre etapas e testar que entrar em Identificação não dispara submit nem erros. | **Sim** |
| F03 **ALTA** | LCP de 3,19 s no desktop local e de 11,06 s e 13,66 s em laboratório móvel limitado. Título oculto na entrada e vídeo de cerca de 5,13 MB no desktop. [Hero](../frontend/src/components/HeroSection.tsx#L26) · [Mascote](../frontend/src/components/HeroMascot.tsx) | A primeira tela pode ficar incompleta por vários segundos em condições restritas. | Manter texto e poster estáveis desde o início, limitar a animação dependente de fonte, reduzir a mídia acima da dobra e repetir a medição com trace. | **Sim** |
| F04 **MÉDIA** | Abas internas do produto. Nas oito dimensões, seta direita na aba Ingredientes não moveu foco ou seleção. Painel sem rótulo associado. [MenuProductCard](../frontend/src/components/MenuProductCard.tsx#L73) | O padrão anunciado como aba não oferece o comportamento esperado de teclado e a associação do conteúdo é menos clara. | Reusar o modelo das categorias, com foco móvel, setas, IDs, aria-controls e aria-labelledby. Validar Tab, setas e ativação. | **Sim** |
| F05 **MÉDIA** | CTA do detalhe nutricional fora da vista nas oito dimensões. Em 320 × 568 o botão começou em y = 1.862 px e ficou acionável após rolar. [MenuProductCard](../frontend/src/components/MenuProductCard.tsx#L97) | A pessoa precisa percorrer o conteúdo técnico até recuperar preço e compra. | Dar acesso persistente ou antecipado ao preço e à compra, com área de rolagem que mantenha tabela e foco desobstruídos. | **Sim** |
| F06 **MÉDIA** | Detalhes falam em tamanhos e adicionais disponíveis, enquanto a sacola observada mostra adicionais indisponíveis e não expõe seletor de tamanho. Em acompanhamentos e bebidas, Ingredientes reaproveita a descrição. [MenuProductCard](../frontend/src/components/MenuProductCard.tsx#L97) · [FullMenuModal](../frontend/src/components/FullMenuModal.tsx#L66) | Expectativas incorretas de personalização ou de detalhamento do ingrediente. | Alinhar a mensagem ao fluxo real e distinguir descrição de lista de ingredientes quando só houver descrição. | **Sim** |
| F07 **MÉDIA** | Em 320 px, ACOMPANHAMENTOS quebra dentro da palavra. A aba ativa tem fonte de 12 px. [FullMenuModal.css](../frontend/src/components/FullMenuModal.css#L107) | Identificação mais lenta numa navegação fixa e recorrente. | Usar rótulo compacto e inequívoco nesse breakpoint ou dar largura suficiente sem quebrar a palavra. | **Sim** |
| F08 **MÉDIA** | Nenhum atalho inicial para conteúdo encontrado. O primeiro Tab foi à navegação ou ao botão Menu nos oito tamanhos. [App](../frontend/src/App.tsx#L60) · [LandingScroll](../frontend/src/components/LandingScroll.tsx#L89) | Usuários de teclado passam pelo cabeçalho recorrente ao acessar a vitrine e a política. | Adicionar um link focável de salto para o conteúdo e verificar foco visível e destino em cada página relevante. | **Sim** |
| F09 **BAIXA** | No EN, cardápio mostrou preço no formato brasileiro com vírgula e a sacola usou ponto para o mesmo tipo de valor. [MenuProductCard](../frontend/src/components/MenuProductCard.tsx#L48) · [OrderDrawer](../frontend/src/components/OrderDrawer.tsx#L58) | Inconsistência de leitura ao comparar valores entre superfícies. | Usar uma convenção de BRL por idioma nas duas superfícies. | Pode ficar para depois |
| F10 **BAIXA** | No mapa com falha induzida, o texto de erro e o aviso foram visíveis, mas os botões de zoom permaneceram sobre uma área sem cartografia. [LocationMap](../frontend/src/components/LocationMap.tsx#L112) | Há controles que parecem úteis quando o mapa não está disponível. | Ocultar ou desabilitar controles indisponíveis e manter a alternativa de localização em texto. | Pode ficar para depois |

Nenhum defeito foi classificado como crítico. Os fluxos inspecionados continuaram recuperáveis. A densidade da foto de Carreiras e o tratamento de sombra da galeria são observações estéticas, separadas dos itens necessários para encerrar.

## I. Decisão de prontidão

**NÃO APROVADO PARA ENCERRAMENTO.** A direção visual pode ser mantida. O encerramento depende de corrigir os problemas de confiança no catálogo, a validação involuntária, a leitura inicial da Hero e as barreiras localizadas de teclado e compra no cardápio. A própria evidência mostra que o trabalho restante é direcionado a esses fluxos.

## J. Nota final e confiança

**7,4/10, confiança global moderada.** A nota se apoia em oito viewports, 120 checagens de imagem, três jornadas de revisão e três amostras de desempenho no build. A confiança nos problemas F01, F02 e F04 é alta por reprodução direta. A confiança em desempenho percebido fora do laboratório é limitada. Safari/iOS, teclado virtual, zoom, leitor de tela real, provedor de mapas ao vivo e métricas de campo permanecem sem validação.

## K. Checklist de encerramento

- [ ] Conferir preço e disponibilidade no cardápio e na vitrine antes de adicionar. Repetir a fixture de preço alterado e produto inativo.
- [ ] Abrir Identificação com um único clique em Continuar, sem evento de submit nem campos inválidos antes da primeira tentativa de revisão.
- [ ] Mostrar a mensagem principal da Hero desde a primeira pintura. Medir novamente LCP em desktop e mobile limitado e rastrear as tarefas longas.
- [ ] Completar o padrão de teclado das abas de detalhe, associar cada painel à aba e testar o salto para o conteúdo.
- [ ] Manter preço e compra alcançáveis durante a leitura nutricional, inclusive em 320 × 568, sem cobrir linhas ou foco.
- [ ] Corrigir a quebra da aba Acompanhamentos e alinhar o texto de ingredientes/personalização à oferta real.
- [ ] Revalidar esses fluxos em PT e EN, com redução de movimento, e cobrir Safari/iOS, teclado virtual e leitor de tela antes de afirmar compatibilidade ampla.
