# The Burger House 2.0 — refinamento visual concluído

28/10/2026. Alterações locais, sem commit ou publicação.

O refinamento preserva a composição e a personalidade existentes. Foram corrigidos
escala, ritmo vertical, tipografia, áreas de imagem, controles e apresentação do
administrativo. Nenhuma integração financeira foi reconstruída.

## Alterações implementadas

- **Tipografia oficial:** Bricolage Grotesque nos títulos/destaques e Gabarito na
  interface, carregadas e verificadas no navegador. Substituídas as referências a
  Anton/Barlow do frontend e Segoe UI do administrativo.
- **Tokens compartilhados:** fontes, cores oficiais, espaçamentos, contêiner,
  escala de títulos, raios e altura de controles em `styles/brand-tokens.css`,
  usados por loja, painel e privacidade. A paleta existente foi preservada;
  tons de contraste foram ajustados para textos pequenos e ações.
- **Hero:** título fluido, estágio das imagens limitado pela viewport, subtítulo
  curto em português e inglês e ações mais compactas. A composição completa cabe
  nos desktops testados, inclusive 1366 × 650.
- **Sobreposição identificada:** o elemento branco era o `Mascot` decorativo com
  posição absoluta no canto inferior direito da hero. Apenas esse ornamento foi
  removido; os três hambúrgueres permanecem, com suas imagens originais.
- **CTA:** “Consulte o cardápio” deixou de ser um parágrafo solto e passou a
  nomear o link primário já existente para `/menu`. Não foi criado outro botão
  redundante. Hover, active, foco e navegação por teclado foram conferidos.
- **Faixa animada:** fundo preto, frases e animação preservados; escala reduzida.
- **Lançamentos:** mantidos os três blocos alternados, fotos, ingredientes,
  mensagens, selos e animações. Imagens e espaçamentos ficaram menores.
- **História e carreira:** títulos com entrelinha adequada, foto contida,
  decoração reposicionada, métricas e convite mais compactos. Links originais
  preservados. “Contemporânea” e “americano” não se sobrepõem; inglês conferido.
- **Cardápio:** grid de três colunas no desktop, duas no tablet e uma no mobile;
  áreas de imagem limitadas, fotos com `object-fit: contain`, descrições e preços
  legíveis. O mascote tem margem de segurança em relação ao título/acento.
- **Carrinho e checkout:** drawer com largura limitada, menos espaços vazios,
  título e opções proporcionais, modal sem gaps estruturais redundantes e campos
  utilizáveis. Controles críticos de toque com pelo menos 44 px; campos mobile
  com fonte de 16 px. Nenhum cálculo, requisito ou handler financeiro foi alterado.
- **Rodapé e navegação:** contêineres alinhados, espaçamentos consistentes, link
  de privacidade acessível e tradução do texto de contato.

## Comparação de proporções

Medições reais no Chromium, português, viewport 1440 × 900. Alturas arredondadas.

| Área | Antes | Depois | Resultado |
|---|---:|---:|---|
| Hero, incluindo faixa | 987 px | 544 px | Aproximadamente 45% menor |
| Lançamentos completos | 2041 px | 1467 px | Aproximadamente 28% menor, conteúdo mantido |
| História + Trabalhe conosco | 981 px | 753 px | Aproximadamente 23% menor |
| Página inicial completa | 4438 px | 3172 px | Aproximadamente 29% menor |
| H1 principal | 96 px | 61,92 px | Escala fluida; palavra longa ajustada ao contêiner |
| Hero do cardápio | 358 px | 188 px | Mascote separado do título |
| H1 do cardápio | 72 px | 51,84 px | Mais proporcional |
| Página de burgers completa | 2295 px | 1687 px | Aproximadamente 26% menor |

Outros limites de apresentação: imagens de destaque com altura fluida de 240 a
304 px; área de imagem dos cards limitada a 224 px; drawer com máximo de 384 px;
checkout com máximo de 704 px e altura de 90dvh. A escala não usa `zoom` ou
`transform: scale()` sobre a página; os transforms de animação/hover existentes
foram preservados.

## Administrativo

Login, navegação, indicadores, filtros, tabelas, estados financeiros, detalhes,
formulários e mensagens recebem a mesma tipografia e família de cores da marca,
com uma apresentação operacional mais densa.

A gestão deixa de expor os 15 formulários completos simultaneamente. Cada produto
aparece em um painel nativo expansível com nome, preço e disponibilidade. O cadastro
também pode ser expandido. Todos os campos e ações continuam nos mesmos formulários,
com os mesmos atributos, validações e handlers. Enter abre o painel pelo teclado.
As ações de salvar continuam usando o fluxo existente, que recarrega a listagem.

A listagem final mede **1108 px de altura em 1440 px de largura** e **1931 px em
390 px**, com todos os 15 produtos presentes. A lista tem duas colunas no desktop
e uma no tablet/mobile. Formulários expandidos também foram verificados.

Foram visitados em sessão legítima **exclusivamente de homologação**: dashboard,
pedidos, pedido Pix 4, produtos, financeiro, loja e segurança. Login/logout normais
foram permitidos; requisições de alteração de produtos, pedidos ou pagamentos foram
bloqueadas pelo verificador e nenhuma foi tentada. Não houve CRUD real para testar
o layout. Nenhuma regra de autorização, cookie ou CSRF foi modificada.

## Política de privacidade restaurada

A política já existia em `privacy.html`, com conteúdo original localizado no
commit local **cc17f02, de 10/10/2026**. O problema era o acesso perdido na nova
navegação, não ausência do texto no repositório.

- Página `/privacy.html` funcional, com apresentação 2.0, leitura responsiva e
  retorno correto para `/menu`.
- Link no rodapé da loja. O link do checkout já existia e foi preservado.
- Conteúdo original de coleta, finalidade, retenção, segurança, direitos e contato
  preservado. Nenhuma caixa obrigatória de consentimento foi adicionada.
- **Trecho desatualizado identificado:** a frase sobre uma mensagem de pedido
  automaticamente preenchida no WhatsApp pertence ao checkout anterior. Essa
  afirmação foi retirada; o compartilhamento necessário com o PagBank permanece.
  O proprietário deve revisar esse trecho se houver outro atendimento manual por
  WhatsApp que precise ser descrito. Não foram inventados prazos ou práticas legais.
- O conteúdo original continua em português. No rodapé em inglês, o link informa
  que a política está em português; não foi criada uma política legal nova em inglês.

## Validação executada

| Verificação | Resultado |
|---|---|
| Testes frontend existentes | **42 aprovados, zero falhas** |
| Regressão administrativa, rótulos acessíveis e privacidade | **53 aprovados, zero falhas** |
| TypeScript | Aprovado |
| ESLint | Zero erros; dez avisos de Fast Refresh nos exports existentes |
| Build cliente + SSR | Aprovado |
| Verificador do build | HTTP 200; nonce CSP distinto por resposta; no-store; rotas administrativas e dependências presentes |
| Artefato frontend | Sem bancos, chaves, credenciais ou ferramentas privadas de manutenção |
| Navegação/renderização | **175 verificações de tela/estado**, PT e EN, sem overflow horizontal, erros JS ou imagens visíveis quebradas |
| Rechecagem final da hero e áreas de toque | **14 combinações aprovadas**, incluindo notebook baixo |
| Gestão final de produtos | **Seis viewports aprovadas**, painéis fechados/abertos e fontes mobile verificadas |
| Contraste e teclado | **34 amostras aprovadas**; foco visível de 3 px e CTA acionado pelo teclado |
| Catálogo | 15 produtos, composição 6/3/6 e dados preservados |

Viewports: **1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024, 390 × 844 e
360 × 800**, mais **1366 × 650**. Foram testados Home, as três categorias, carrinho,
escolha de entrega/retirada, dados, revisão do pedido e privacidade em PT/EN;
o administrativo mantém seu idioma original e foi navegado em todos os tamanhos.

As inspeções por captura identificaram e corrigiram a quebra interna da palavra
“arrependimento” no tablet, alvos pequenos de fechamento/remoção, espaçamentos dos
painéis e fonte pequena nos textareas administrativos mobile. As rechecagens
focadas não recriaram jornadas financeiras.

O primeiro disparo de dois testes com servidor HTTP fictício encontrou a restrição
de rede do executor local; a suíte completa passou ao rodar com acesso ao servidor
local. O detector visual apontou uma borda lateral de 6 px preexistente no toast;
ela foi removida. Os avisos existentes de Vite/Fast Refresh não motivaram refatoração
fora de escopo. A validação de imagens espera o decode e ignora previews sem src
que já ficam ocultos quando o produto não tem imagem administrativa cadastrada.

## Preservação das integrações e dos dados

- **227 arquivos protegidos conferidos por hash.** A única exceção intencional foi
  `scripts/admin/views.js`, devido aos wrappers visuais dos painéis de produtos.
  Ao remover apenas esses wrappers em memória, o hash original é reproduzido:
  nenhum outro conteúdo daquele módulo foi alterado.
- Backend ASP.NET, API, contratos, clientes administrativos, modelo, catálogo,
  regras do carrinho, validação do comprador e módulos financeiros permanecem
  inalterados. Os trechos de lógica anteriores ao JSX do cardápio e checkout
  foram comparados e são idênticos.
- Leitura SQLite isolada: **15 produtos, seis pedidos, seis itens, seis pagamentos,
  dez auditorias e 23 migrations**, integridade `ok`, zero falhas de FK.
- Todos os campos dos 15 produtos mantêm o fingerprint anterior
  `539445f5727d1318ec1ee76aa18ffae8bdb1d5ef344b184229c078386b22787c`.
- Pix 4 e crédito 5 permanecem presentes no banco isolado. Nenhum pedido,
  pagamento ou transação de teste foi criado nesta missão.
- Não houve edição direta de banco, migrations ou operações financeiras.
  Sessões de teste foram criadas/revogadas somente pelo login/logout normal de
  homologação. Não se afirma que o arquivo SQLite inteiro ficou byte a byte igual.
- Produção, Azure, Vercel, tokens, preços, taxas, dados dos produtos, imagens,
  callbacks e regras de pagamento não foram alterados. Apenas o gateway local
  foi recarregado para servir o build atualizado; a API não foi reiniciada.
- Nenhum commit, push, merge, deploy, troca de branch, reset, clean ou remoção
  de arquivos não rastreados.

## Arquivos alterados nesta missão

Fontes de apresentação e montagem:

- `src/styles.css`
- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/routes/menu.tsx`
- `src/components/site.tsx`
- `src/features/checkout/CheckoutDialog.tsx` — apenas JSX/classes/dimensões
- `styles/brand-tokens.css` — novo arquivo compartilhado
- `styles/admin.css`
- `styles/privacy.css`
- `admin/index.html` — carregamento das fontes
- `privacy.html`
- `scripts/admin/views.js` — wrappers visuais nativos, formulários intactos
- `scripts/prepare-public-assets.mjs` — cópia do CSS de tokens para o frontend
- `scripts/verify-frontend-refinement.mjs` — verificação visual segura

Cópias públicas geradas pelo procedimento de assets:

- `public/admin/index.html`
- `public/privacy.html`
- `public/styles/admin.css`
- `public/styles/privacy.css`
- `public/styles/brand-tokens.css`
- `public/scripts/admin/views.js`

Este relatório e evidências em `test-results/frontend-refinement/` também foram
acrescentados. As alterações locais preexistentes foram preservadas. `DESIGN.md`
e `PRODUCT.md` descrevem uma proposta histórica diferente do briefing atual e não
foram reescritos como efeito colateral desta missão.

## Evidências e limites

Resultados: `tests-final.json`, `legacy-regression-final.json`, `responsive.json`,
`final-targeted.json`, `admin-final.json`, `contrast-keyboard.json`,
`protected-review.json`, `database-preserved.json`, `url-verification.json` e
`build-verification.log`, em `test-results/frontend-refinement/`.

As capturas `before-*`, `after-*` e `final-*` permitem comparar as versões. Exemplos:
`before-1440-home.png`, `after-1440-pt-home-full.png`,
`final-768-1024-pt-home.png`, `final-360-800-pt-checkout.png`,
`final-1440-admin-products.png` e `final-390-admin-product-expanded.png`.

A validação visual foi feita em Chromium real automatizado. Safari, Firefox e
dispositivos físicos não foram testados nesta missão. A política original em
português e a revisão do trecho antigo de WhatsApp são os únicos pontos editoriais
destacados; não há falha funcional nova comprovada bloqueando a avaliação visual.
As pendências financeiras externas anteriores não foram alteradas nem declaradas
resolvidas por este trabalho de apresentação.

## Abrir para avaliação

Home, cardápio, login administrativo, privacidade e catálogo retornaram HTTP 200.
O endereço foi consultado em 28/10/2026 às 17:09 de Brasília; identidade da API:
Homologation, isolated=true, sandbox=true. O gateway usa a API isolada local,
sem fallback para produção. Os links são temporários e dependem dos processos
locais de homologação/túnel continuarem ativos.

Site principal:

```text
https://adventure-threatened-preceding-asia.trycloudflare.com/
```

Painel administrativo:

```text
https://adventure-threatened-preceding-asia.trycloudflare.com/admin/
```
