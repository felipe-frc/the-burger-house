# Locations — reconstrução local da The Burger House

03/11/2026. Referência: [Pretty Patty / Locations](https://www.prettypatty.ch/locations). Ambiente implementado e verificado: `http://127.0.0.1:3001/#locations`. Sem publicação.

## A. Engenharia reversa

**CONFIRMADO:** inspeção em Chromium/Playwright, DOM, estilos computados, geometria e screenshots, nos oito viewports solicitados. O REA também inspecionou a página por CDP: evidência `ev_829dd22d98efb1fb7dc9a5a7adc19986b22c510fe6a6b31b4692bf3b131f3d0f`, retida em `audit/locations-2026-11-03/rea-page-evidence.json`.

A página é Webflow, com título central, seguido de uma coleção vertical de unidades. Cada unidade tem uma galeria Swiper e um painel de informações independente da imagem. No desktop, o painel creme, de borda fina e sem cantos arredondados, fica centralizado junto à borda inferior da fotografia. Contém uma imagem de marca à esquerda e os dados à direita. No mobile, passa ao fluxo normal, imediatamente abaixo da fotografia. O título possui ilustração própria da Pretty Patty; ela não foi reutilizada.

Seletores observados: `.p-locations__heading`, `.p-locations__h1`, `.p-locations-wrap`, `.location-item`, `.location-slide__slider-wrap`, `.location-slide__info`, `.loaction-slide__column`, `.location-slide__gif` e `.location-slider__track`.

| Viewport | Fotografia ativa, px | Fim do título → foto, px | Painel de informações, px | Posição do painel |
| --- | --- | --- | --- | --- |
| 1920 × 1080 | 1158 × 858 | 78,1 | 555,7 × 190,1 | Sobre a foto |
| 1600 × 900 | 1158 × 858 | 78,1 | 555,7 × 190,1 | Sobre a foto |
| 1440 × 900 | 1158 × 858 | 78,1 | 555,7 × 190,1 | Sobre a foto |
| 1366 × 768 | 1098,3 × 813,9 | 74,1 | 527,2 × 180,3 | Sobre a foto |
| 1024 × 768 | 822,3 × 610,1 | 55,5 | 396,2 × 135,2 | Sobre a foto |
| 768 × 1024 | 615,7 × 457,6 | 41,6 | 298,2 × 101,4 | Sobre a foto |
| 390 × 844 | 344,4 × 628,2 | 45,8 | 390 × 241,5 | Abaixo da foto |
| 375 × 667 | 331 × 604 | 44 | 375 × 233 | Abaixo da foto |

Em 1440 px: faixa externa de largura total; slide central com 1162 px, incluindo 2 px de preenchimento em cada lado; fotografia com `object-fit: cover`; título a 64 px com line-height de 76,8 px, com altura total de 89,5 px devido à composição interna. Painel com padding de 24 px, intervalo horizontal de 16 px e distância inferior de aproximadamente 20 px. No mobile de 375 px, painel com padding de 24 px e imagem de marca de aproximadamente 68 px. As medidas são estados observados, não valores universais para outros navegadores.

**CONFIRMADO:** o botão de próxima foto altera a translação horizontal da galeria; o slide ativo mudou durante a captura após o clique. Há setas e fotos vizinhas parcialmente visíveis. Essa funcionalidade não é necessária para uma única fotografia da The Burger House. O título tem atributos de interação Webflow e estava com opacidade 1 e transformação identidade no estado estabilizado.

**NÃO IDENTIFICADO:** duração completa da entrada inicial do título e todos os estados da galeria em dispositivos físicos. O `transitionDuration` de 0,2 s encontrado no slide não foi apresentado como duração comprovada da translação de seu wrapper. Nenhuma animação de entrada, pinning ou empilhamento foi adicionada à implementação.

Na primeira tentativa de medir a referência, um modal promocional apareceu com atraso e bloqueou o clique na seta. O erro real foi `dialog#whatsapp-modal intercepts pointer events`. A captura foi refeita após aguardar e fechar o modal pelo controle “Not now”, sem remover elementos da página. As capturas finais `reference-*.png` são as imagens sem essa obstrução; `reference-initial-1440.png` documenta o primeiro carregamento com o modal.

## B. Implementação e origem dos dados

Uma única unidade: **Balneário Camboriú, Santa Catarina**. Título exatamente **ONDE NOS ENCONTRAR**, sem subtítulo ou decoração entre título e foto. Fotografia imediatamente a seguir, centralizada e sem o antigo card dividido em duas colunas. Informações organizadas em logo, nome, estado, endereço, telefone, WhatsApp, funcionamento e ações compactas.

A fonte de dados continua sendo o objeto já presente em `LocationsSection.tsx`; seus oito campos foram preservados:

- Endereço: `Rua Dev, nº 1280 — Balneário Camboriú, Santa Catarina`.
- Telefone: `(47) 99999-9999`; URI `tel:+5547999999999`.
- WhatsApp: `https://wa.me/5547999999999`.
- Horário: `18H–23H`, com “Segunda a domingo”, já escrito no componente anterior. Não foi encontrada uma configuração compartilhada para essa informação no frontend pesquisado.
- Maps: mesma URL Google Maps e mesma consulta existentes.
- Imagem: `/assets/pretty-patty/area-externa.png`, original **1254 × 1254 px**, sem sobrescrita ou processamento do asset.

O nome da pasta do asset não significa que a foto tenha sido copiada nesta tarefa: trata-se da fachada ilustrativa da The Burger House já usada anteriormente. O alt preserva essa natureza ilustrativa.

“Pedir para retirar” chama o mesmo `onSelectLocationForOrder(location.city)`. O handler existente em `App.tsx` abre `handleOpenOrder('takeaway')`. Telefone, WhatsApp e Maps mantêm seus destinos; links externos usam `noopener noreferrer`.

Paleta local: base creme `#FFF7E3`, título e controles azul `#2864F0`, texto `#171717`. A fachada e o logo mantêm suas cores originais. Não foi acrescentada decoração para forçar o uso de todas as cores da paleta.

### Tipografia e conflitos

A configuração efetiva anterior carregava **Anton e Barlow Condensed**, inclusive com regras globais `!important`. Bricolage Grotesque e Gabarito não estavam configuradas nem foram encontradas como fontes locais na pesquisa do projeto. A nova folha CSS carrega as duas famílias solicitadas por Google Fonts e as aplica somente em Locations por variáveis locais. A tipografia das demais seções permanece igual.

O bloco antigo `TBH_LOCATIONS_LAYOUT_FIXED_START/END` foi removido de `src/index.css`, juntamente com o seletor específico do subtítulo removido. A nova composição tem uma única folha própria, sem empilhar correções ao final do CSS global. Apenas peso e entrelinha dos headings usam overrides necessários para superar as regras globais existentes; nenhum reset global foi introduzido.

## C. Arquivos modificados

| Arquivo | Finalidade |
| --- | --- |
| `frontend-ai-studio/src/components/LocationsSection.tsx` | Nova composição semântica, remoção do subtítulo e preservação dos dados/callbacks |
| `frontend-ai-studio/src/components/LocationsSection.css` — novo | Layout, fontes restritas à seção, fotografia, painel e breakpoints |
| `frontend-ai-studio/src/index.css` | Remoção exclusiva do bloco antigo de Locations e seletor do subtítulo |
| Este relatório | Evidência, comparação, testes e pendências |
| `audit/locations-2026-11-03/` | Scripts de investigação/validação, resultados JSON e capturas |

`before-manifest.json` e `scope-verification.json` conferem os hashes de `src` e `public`: somente os dois arquivos preexistentes acima mudaram e uma folha CSS de aplicação foi criada. Fotografias, Hero, Navbar, favoritos, Sobre Nós, Footer, carrinho, checkout e catálogo não foram modificados. A alteração no CSS compartilhado foi limitada às regras antigas da própria seção. Sem instalação de dependências, backups automáticos, commit, push ou deploy.

## D. Comparação visual

Mantidos: hierarquia título → foto → informações; título central; intervalo proporcional até a fotografia; fotografia central com até 1162 px de largura e 858 px de altura; painel creme retangular de borda fina, logo à esquerda e dados à direita; painel sobreposto no desktop/tablet e em fluxo normal no mobile. A navbar permanece fixa.

Diferenças necessárias:

- Uma unidade e uma fotografia, sem slides, setas, unidades adicionais ou repetição artificial da imagem nas bordas.
- Título e identidade The Burger House; nenhum logo, ilustração, GIF ou foto da referência incorporado à aplicação.
- Painel desktop com até **680 × 286,2 px**, maior que a referência por conter nome mais longo, estado, WhatsApp e as duas ações exigidas, mantendo fontes legíveis.
- No tablet, a referência reduz também a tipografia proporcionalmente; a implementação mantém informações a pelo menos 14 px em vez de copiar a redução extrema.
- No mobile, foto **335 × 335 px** em viewport de 375 px, preservando integralmente a fachada quadrada e o letreiro. Copiar o recorte retrato de 331 × 604 px da referência removeria grande parte das laterais desse asset. O painel fica abaixo e cresce naturalmente, sem altura imposta pela viewport.

Comparações em resoluções equivalentes: `reference-1440.png` / `implementation-1440.png`, `reference-info-1440.png` / `implementation-info-1440.png`, e os mesmos pares para 1920, 1600, 1366, 1024, 768, 390 e 375, na pasta de auditoria. As coordenadas absolutas da página diferem porque a loja é uma landing page com outras seções anteriores.

## E. Validação real

- `npm run lint`: TypeScript aprovado.
- `npm run build`: aprovado. Permanece o aviso preexistente de uso de `__dirname` na configuração Vite; nenhuma alteração de configuração foi feita.
- Sete testes existentes de catálogo, cálculos, formulário e parser de ingredientes: aprovados. Não havia teste unitário específico de Locations; a interação foi validada no navegador.
- Layout verificado em **1920×1080, 1600×900, 1440×900, 1366×768, 1024×768, 768×1024, 390×844 e 375×667**.
- Todos os cenários carregaram a mesma foto, com dimensão natural 1254 × 1254; Bricolage Grotesque e Gabarito foram efetivamente carregadas.
- Sem overflow horizontal da página ou conteúdo textual excedendo seus elementos. Painel dentro da fotografia no desktop/tablet; painel após a fotografia no mobile. Título e subtítulo verificados automaticamente.
- URIs de telefone, WhatsApp e Maps conferidas; destinos de contato não foram acionados para telefonar ou enviar mensagens. Foco do botão de retirada visível.
- Callback de retirada abriu o drawer existente no modo **TAKE-AWAY (PICKUP)** nos oito viewports. Nenhuma compra foi concluída, pedido criado ou pagamento acionado. Requisições de escrita foram bloqueadas pelo teste e nenhuma tentativa foi registrada.
- Nenhum erro JavaScript de página ou resposta de recurso com HTTP >=400 capturado nos oito cenários. Navbar fixa visível após rolagem.

Resultados em `validation.json`; script `validate-locations.mjs`. A execução inicial parou em um seletor de teste que procurava o `nav` desktop oculto no tablet; o verificador passou a conferir o `header` fixo real. Outra execução identificou o problema do drawer descrito a seguir; os dois cenários móveis foram concluídos registrando o bloqueio e fechando pelo teclado, sem mascará-lo com clique forçado.

## F. Pendências e limites

1. **Dados provisórios:** “Rua Dev” e `(47) 99999-9999` têm aparência de placeholders. Foram preservados conforme solicitado e precisam de confirmação antes de publicar. Google Maps continua pesquisando esse endereço provisório. O horário tem origem literal no componente; não é consulta em tempo real do estabelecimento.
2. **Fluxo de retirada preexistente:** o callback abre corretamente o modo de retirada, mas `OrderDrawer.tsx` ainda contém referências a Zurich/Genève. Seu handler atual não utiliza o nome de unidade recebido para atualizar esse conteúdo. Não foi alterado porque carrinho/checkout estão expressamente fora do escopo.
3. **Sobreposição preexistente no drawer mobile:** em 390 e 375 px, o header fixo intercepta o toque no botão “Close bag”. A abertura funciona e o botão fecha com foco + Enter; o fechamento por toque não está aprovado. Evidências: `existing-drawer-overlap-390.png`, `existing-drawer-overlap-375.png` e `pickupClosePointerAccessible: false` em `validation.json`. Navbar e drawer permaneceram intactos; corrigir essa interação exige tarefa própria nesses componentes.
4. **Fontes:** Bricolage/Gabarito dependem do carregamento Google Fonts; o CSS prevê fallback sans-serif. Não foi realizada instalação de fontes ou dependências.
5. **Cobertura:** testes em Chromium com emulação mobile; sem validação em dispositivo físico/Safari. Não foi ensaiada finalização de checkout nem qualquer operação financeira.
