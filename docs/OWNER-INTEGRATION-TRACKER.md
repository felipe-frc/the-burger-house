# Integração Owner — The Burger House

## Módulos operacionais acrescentados em 16/11/2026

A migration `AddOwnerOperationalModules` acrescenta tabelas próprias ao SQLite. As rotas usam a política Owner e as mutações exigem CSRF. Os testes usam fixtures sintéticas e exercitam a migration somente em SQLite descartável.

| Módulo | Contrato e comportamento |
|---|---|
| Estoque | `GET/POST /api/admin/stock` e `GET/POST /api/admin/stock/{id}/movements`. Cadastro com saldo inicial zero, unidade declarada pelo operador e mínimo. Entradas, saídas e ajustes conservam a precisão de até três casas. A revisão evita perda de atualização. A chave de requisição torna seguro repetir a mesma movimentação. Saldo, histórico e auditoria são gravados na mesma transação. O saldo não é alterado pelo fluxo de pedidos. |
| Equipe | `GET/POST /api/admin/team` e `PUT /api/admin/team/{id}`. Busca, filtro por situação e paginação. Alterações usam revisão. Nome e e-mail são criptografados em repouso. O cadastro e a função operacional são separados da identidade de login. |
| Agenda | `GET/POST /api/admin/agenda` e `PUT/DELETE /api/admin/agenda/{id}`. Intervalos de calendário, revisão e exclusão lógica. Owners compartilham a agenda. A importação voluntária reaproveita os identificadores locais, mantém os originais e preserva as versões que já foram alteradas no servidor. |
| Notificações | `GET /api/admin/notifications/inbox`, `PUT /read`, `PUT /{orderId}/read` e `PUT /{orderId}/archive` relativos à caixa. Pagamentos com aprovação registrada compõem a caixa paginada. Leitura e arquivo são vinculados ao Owner autenticado. O contrato anterior `GET /api/admin/notifications` continua disponível para seus consumidores. |

O cenário `npm run test:owner:browser-sqlite` cria e encerra a API e o gateway de teste. Exercita os módulos no Chromium, reinicia a API e verifica a persistência da Agenda, da Equipe, do Estoque e das notificações. As rotas de checkout e pagamento ficam bloqueadas nesse cenário. A jornada de pagamento com transporte PagBank controlado roda em `StorefrontFlowTests`, na suíte HTTP.

## Histórico da consolidação de 14/11/2026

Atualizado em 14/11/2026 na branch `feat/burger-house-2.0`. A classificação vale para o escopo indicado em cada linha. HOMOLOGADO exige execução no Chromium com API de homologação e SQLite isolado. Os caminhos de API na tabela usam o prefixo `/api/admin`. Os serviços HTTP utilizam `owner-ui/src/services/adminHttp.ts`.

| Módulo e estado | React e serviço HTTP | Endpoint, contrato e persistência | Testes, evidência e pendência |
|---|---|---|---|
| Visão Geral — HOMOLOGADO | `OverviewPage`, `useOwnerDashboard`, `useOwnerFinance` | `GET /dashboard`, `/orders` por status, `/finance/revenue` e `/finance/payment-methods`. DTOs Dashboard, Page<OrderRow>, RevenuePoint e MethodSummary, lidos do SQLite. | Renderizou após recarregar a sessão real. Alertas e lista de pedidos ainda refletem a página carregada. |
| Pedidos — HOMOLOGADO no cenário sintético | `OrdersPage`, `ownerOrders` | `GET /orders`, `GET /orders/{id}`, `PATCH /orders/{id}/status`. Page<OrderRow>, OrderDetail e status esperado. Alteração persiste no backend. | Detalhe com recarga, pagamento preservado e conflito 409 no cenário real isolado. Busca/filtros no Chrome com fixtures e paginação no backend. Criação administrativa permanece indisponível. |
| Cozinha — HOMOLOGADO no cenário sintético | `KitchenPage`, `ownerOrders` | `GET /orders?Status=Received/Preparing` (um status por consulta), `PATCH /orders/{id}/status`. Fila paginada e transição persistida. | Chrome e SQLite novo confirmaram recebido → em preparo → pronto. Fila com 15 e conflito de estado têm cobertura adicional com fixtures. |
| Expedição — HOMOLOGADO no cenário sintético | `ExpeditionPage`, `ownerOrders.advanceOrder` | `GET /orders?Status=ReadyForPickup`, `PATCH /orders/{id}/status` com `expectedStatus`, `status` e DispatchChecklist (`items`, `packaging`, `identification`). Backend audita a liberação. Rascunho da conferência é local à tela. | Liberação pelo Chrome, estado relido e checklist confirmado na auditoria da API; teste HTTP comprova rejeição de checklist incompleto. |
| Entregas — HOMOLOGADO no cenário sintético | `DeliveryPage`, `ownerOrders` | `GET /orders?Status=OutForDelivery`, `PATCH /orders/{id}/status`. Finalização persistida. | Chrome concluiu entrega e reabriu detalhe concluído. API confirmou pagamento aprovado e valor original. |
| Cardápio — HOMOLOGADO para leitura, edição e imagem | `MenuPage`, `ownerProducts` | `GET/POST /products`, `PATCH /products/{id}`, `POST/DELETE /products/{id}/image`, `POST /products/translate`. ProductRow/ProductRequest e multipart; catálogo e referência de imagem persistidos. | Chrome gravou categoria, enviou imagem, confirmou URL da imagem e releu remoção. Tradução automática não foi acionada no ambiente real. |
| Estoque — NÃO INICIADO | `StockPage`, callback demonstrativo bloqueado | Nenhum endpoint de saldo/movimentação identificado. `/products` representa catálogo, não estoque quantitativo. | Definir entidade, unidade, mínimo, movimentação auditável e migration aditiva. Sem evidência de persistência. |
| Clientes — HOMOLOGADO para consulta | `CustomersPage`, `ownerCustomers` | `GET /customers`, CustomerSummary e CustomerPurchase provenientes do histórico de compras aprovadas. Busca local por nome. | O Chrome abriu a ficha do cliente sintético e encontrou a compra aprovada. Testes de mapeamento preservam totais. |
| Financeiro — HOMOLOGADO | `FinancialPage`, `useOwnerFinance`, `ownerFinance` | `GET /finance/{summary,revenue,payment-methods,transactions,audit}`. FinanceSummary, RevenuePoint, MethodSummary, Page<TransactionRow>, AuditLogRow. Leituras de banco. | Tela e auditoria renderizadas em HTTPS sem interceptação. Teste de receita líquida negativa e parâmetros de período. Exportação de transações limitada à página. |
| Relatórios — HOMOLOGADO | `ReportsPage`, `useOwnerFinance`, `ownerFinance` | Mesmas consultas financeiras. CSV deriva de RevenuePoint, sem armazenamento próprio. | Tela renderizada no Chromium. Exportação verificada em teste de serialização. Ranking e divisão por canal não estão no contrato. |
| Equipe — NÃO INICIADO | `TeamPage`, callbacks demonstrativos bloqueados | Nenhum CRUD de funcionários identificado. Identidade Owner é separada. | Definir entidade de funcionário, funções, auditoria e endpoints protegidos. |
| Configurações — HOMOLOGADO para limites operacionais | `SettingsPage`, `OperationSettingsForm`, `ownerSettings` | `GET/PUT /operation/settings`, OperationSettings com revisão. `GET /store`, `POST /auth/change-password`. | Chrome gravou e releu limite após recarga no SQLite novo. Troca de senha testada na API e no navegador com fixture. |
| Agenda — EM IMPLEMENTAÇÃO | `AgendaModal`, `agendaService` | Persiste somente no navegador. Nenhum DTO ou endpoint de compromissos disponível. | Criar persistência protegida Owner e substituir chamadas locais. Sem homologação operacional. |
| Notificações — INTEGRADO — NÃO HOMOLOGADO | `NotificationDrawer`, `App`, `ownerNotifications` | `GET /notifications`, NotificationBatch com janela e cursor. Eventos vêm de pagamentos aprovados. Lido e dispensado ficam na sessão. | Testes de lote vazio e paginação. Falta observar evento novo em banco sintético no Chromium. |

## Evidências e execução

- `test-results/acceptance/owner-local-https.json` registra o Chromium em HTTPS com SQLite `burgerhouse.homologation.db`: login 200, cookie Secure/HttpOnly/SameSite Strict com caminho da API, sessão após recarga, logout sem CSRF 400, logout com CSRF 204 e sessão revogada 401. JS/CSS 200 e asset ausente 404.
- No pacote final, também foram verificadas a página inicial da loja e a leitura/navegação de Pedidos, Cozinha, Expedição, Entregas, Clientes e Configurações. Essa validação não cobre as mutações nem a ficha do cliente com compras. O catálogo exibiu 15 produtos na base isolada.
- `npm run build:vercel` gerou pacote de loja e Owner em `test-results/owner-consolidation-final` para teste local. O navegador de teste aceita o certificado local somente no contexto descartável.
- TypeScript, 13 testes de serviços Owner, 3 de assets/fallback e 646 testes .NET aprovados.
- O gateway padrão 4174 servia o HTML legado durante a inspeção. A verificação do pacote React usa porta local separada escolhida com `HOMOLOGATION_GATEWAY_PORT=0`.
- As verificações de navegador fazem leituras de negócio e abrem/revogam somente a sessão de homologação.

## Descontinuação estrutural e validação final

- O artefato servido em `/admin/` contém somente o Owner React. A verificação do pacote rejeita a árvore pública `scripts/admin/`, o CSS administrativo antigo e a cópia empacotada de Simple Liquid Glass.
- Foram removidos `scripts/admin/{main,views,client,model,icons,product-images,liquid-glass,theme}.js`, `scripts/lib/simple-liquid-glass-owner.js`, a dependência npm sem consumidores e o store demonstrativo do React (`apiClient.ts` e `demoData.ts`). O motor genérico `scripts/lib/liquid-glass.js` está fora dos builds e é independente do antigo adaptador. `scripts/admin/homologation.ps1`, `register-missing-products.mjs` e as ferramentas operacionais permanecem.
- Quatro verificadores operacionais foram adaptados às rotas e controles React: `verify-owner-final.mjs`, `verify-frontend-refinement.mjs`, `verify-catalog-final.mjs` e `verify-paid-owner.mjs`. Sintaxe verificada localmente. Dependências de ambientes hospedados nesses verificadores não foram exercitadas.
- O Owner recupera rotas administrativas, detalhe por ID, troca de senha e configuração de tema claro/escuro/sistema. Busca e status dos pedidos são enviados ao servidor. O Cardápio permite editar descrições e traduções com o contrato existente. O Financeiro utiliza os períodos e o intervalo customizado da API. As notificações preservam o cursor e retomam a consulta na reconexão.
- `npm run test:owner:e2e` passou 14 casos no Chrome instalado (3 smoke do artefato e 11 com API de teste). `npm run test:integration` registrou 56 aprovados e 10 exclusões condicionais já existentes da matriz de loja (duplicações da matriz de viewport ou casos dedicados a desktop). As duas suítes constroem e limpam um pacote exclusivo e encerram servidores de porta dinâmica.
- `npm test`: 40. `npm run test:admin`: 13 serviços Owner com `node:test` + 81 testes de classificação/checkout/status. `dotnet test backend/BurgerHouse.sln --no-restore`: 647. `node --test tests/homologation-static.test.mjs`: 3. TypeScript, builds da loja e Owner, `verify:build` e `git diff --check` aprovados.
- `OwnerOrderLifecyclePersistsThroughHttpWithCsrfConcurrencyAndChecklist` em `AdminSecurityTests.cs` exerce os controllers ASP.NET Core com banco SQLite criado para o teste. O fluxo verifica 401 anônimo, 400 sem CSRF, 409 para transição inválida e estado esperado desatualizado, rejeição de checklist incompleto e releitura após cada gravação. Uma nova instância do DbContext confirma pagamento aprovado no valor original e checklist da expedição na auditoria.
- `npm run test:owner:browser-sqlite` passou com Chrome, HTTPS local, controllers ASP.NET Core e SQLite descartável na mesma execução. O gateway bloqueou checkout e pagamentos. O relatório está em `test-results/acceptance/owner-browser-sqlite.json`. Chrome, gateway, API, banco e pacote do teste são encerrados ou descartados ao final.

### Mapa da cobertura retirada

| Testes anteriores | Cobertura no Owner e na API |
|---|---|
| `admin.test.js`, `admin.e2e.js` | Serviços `adminHttp`, `ownerOrders`, `ownerFinance`, `ownerProducts` e `ownerIntegration`, `AdminSecurityTests` e `owner-react.contract.spec.js`. Sessão, validação, dados privados, CSRF, transições, configurações, pagamentos e agregações testados. |
| `admin-accessible-labels.test.js` e cenário administrativo de `product-classification.e2e.js` | Edição e recarga do dialog de Cardápio, rótulos distintos de descrição e payload com classificação/ordem/tradução. O cenário público permanece no arquivo original. |
| `delivery-center.spec.ts`, `owner-live.spec.ts` | Ciclo da cozinha à entrega, fila de 15, recuperação após resposta 409, 51 notificações paginadas após reconexão e persistência real em testes .NET. A atualização automática contínua de um detalhe aberto por outro operador permanece pendente. |
| `owner-operation-views.spec.ts`, `admin-liquid-glass.e2e.js`, `admin-visual.e2e.js` | Navegação por rota e recarga, desktop/móvel, alternância por teclado, superfícies com blur em claro/escuro, fallback de transparência reduzida, diálogos e CSV. O seletor SVG do adaptador antigo foi descontinuado junto com esse renderizador. A cobertura de auditoria visual em toda a matriz legada e de acessibilidade automatizada do painel não foi integralmente reproduzida. |
| `admin-helpers.js` | Fixture do servidor oficial descartável e interceptação explícita somente nos specs. `admin-fixtures.js` ficou como fonte de DTOs sintéticos usados pelo Owner React. |

## Próxima ação executável

1. Exercitar notificações com um evento sintético novo após login no cenário sem mocks e cobrir atualização de detalhe aberto por um segundo operador. Completar a matriz automatizada de acessibilidade e visual do Owner.
2. Validar tradução automática com um provedor isolado controlado. A edição manual em inglês já tem teste de interface e usa o contrato existente.
3. Estoque quantitativo e Equipe seguem indisponíveis porque não têm contratos de persistência no backend. Agenda preserva dados deste navegador com rótulo local e sem sincronização. Definir as regras de persistência desses recursos antes de acrescentar endpoints e migrations.
