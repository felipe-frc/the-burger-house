# Transição para o Checkout PagBank

O PagBank é o provedor usado por `POST /api/checkout/{orderId}` nesta etapa. O Mercado Pago continua registrado para processar Preferences e webhooks já existentes; seus arquivos, configurações, pacote e migrations permanecem no projeto.

## Configuração

Configure os valores por variáveis de ambiente ou App Settings do Azure:

- `PagBank__BaseUrl`: `https://sandbox.api.pagseguro.com` no Sandbox; use a URL oficial de produção ao promover a integração.
- `PagBank__Token`: token da conta PagBank. O valor não deve ser versionado nem registrado em logs.
- `PagBank__RedirectUrl`: URL HTTPS pública do frontend para o retorno do comprador.
- `PagBank__NotificationUrl`: URL HTTPS pública do backend terminando em `/api/webhooks/pagbank`.

As variáveis `MercadoPago__AccessToken`, `MercadoPago__WebhookSecret`, `MercadoPago__ReturnUrl` e `MercadoPago__NotificationUrl` continuam necessárias enquanto o webhook antigo estiver ativo.

## Fluxo

1. O frontend cria o pedido em `POST /api/orders`.
2. `POST /api/checkout/{orderId}` cria ou reutiliza um `Payment` local do provedor `PagBank`.
3. O backend envia `POST /checkouts` com `reference_id = payment:{Payment.Id}`, valor em centavos, URLs de retorno e notificação.
4. O backend armazena o `CHEC_...` em `ExternalCheckoutId` e devolve o link cujo `rel` é `PAY`.
5. A resposta temporariamente contém `paymentId`, `checkoutUrl` e o alias `initPoint` com a mesma URL.
6. O frontend valida o host, salva os IDs locais no `sessionStorage` e redireciona o comprador.
7. O PagBank chama `POST /api/webhooks/pagbank`. O backend valida a assinatura ECDSA do corpo bruto usando a chave pública obtida em `GET /public-keys?type=webhook`.
8. O identificador `CHAR_...` apenas dispara `GET /charges/{id}`. O backend usa o resultado autenticado para conferir referência, valor, moeda, método e status.
9. Depois do HTTP externo, uma transação curta recarrega `Payment` e `Order`, repete as correlações dependentes do estado atual e grava os dois atomicamente.
10. Um pagamento aprovado muda o pedido de `PendingPayment` para `Received`. O retorno do navegador nunca aprova um pagamento; o frontend consulta `GET /api/payments/{paymentId}`.

Notificações de ciclo de vida do checkout sem cobrança são autenticadas e respondidas como ignoradas. Notificações financeiras repetidas são idempotentes. Uma cobrança diferente não pode substituir um `ExternalPaymentId` já atribuído.

## Persistência e coexistência

A migration `AddPaymentProviderAndPagBankCheckout` adiciona `Provider` e `ExternalCheckoutId`, além do índice único composto `Provider + ExternalCheckoutId`. Registros anteriores recebem `Provider = MercadoPago`. `ExternalPreferenceId`, `ExternalPaymentId` e a coluna física histórica `ExternalOrderId` são preservados.

Um pagamento ativo só pode ser reutilizado pelo mesmo provedor. O código não infere o provedor pelo formato do identificador e nunca grava um ID PagBank em `ExternalPreferenceId`.

## Status e métodos

Mapeamento de status de cobrança:

| PagBank | Estado interno |
|---|---|
| `AUTHORIZED`, `IN_ANALYSIS`, `WAITING` | `Pending` |
| `PAID`, sem reembolso | `Approved` |
| `DECLINED` | `Rejected` |
| `CANCELED` | `Cancelled` |
| `PAID`, valor totalmente reembolsado | `Refunded` |
| `PAID`, valor parcialmente reembolsado | `PartiallyRefunded` |

Status desconhecidos geram erro e não alteram o banco. O PagBank não fornece nesse fluxo uma equivalência usada para `ChargedBack`; esse estado interno continua preservado para o Mercado Pago e para uma etapa futura que implemente o formato específico de pós-transação do PagBank.

Mapeamento de método:

| PagBank | Método interno |
|---|---|
| `PIX` | `Pix` |
| `CREDIT_CARD` | `CreditCard` |
| `CREDIT_CARD` com produto `PRE_PAID` | `PrepaidCard` |
| `DEBIT_CARD` | `DebitCard` |
| `BOLETO` ou método sem equivalência clara | `Unknown` |

Um método desconhecido nunca é convertido em outro. Como o domínio exige um método conhecido para aprovar, uma cobrança paga com método ainda não representado é recusada para revisão em vez de ser classificada incorretamente.

## Teste no Sandbox

1. Configure as quatro variáveis `PagBank__...` sem gravar o token no repositório.
2. Garanta que `PagBank__RedirectUrl`, `PagBank__NotificationUrl`, CORS e a URL da API no frontend apontem para endpoints HTTPS públicos.
3. Aplique as migrations e inicie a API.
4. Crie um pedido, chame `/api/checkout/{orderId}` e abra `checkoutUrl`.
5. Confirme que o webhook assinado atualiza o pagamento somente depois da consulta oficial da cobrança.

Verificação automatizada:

```sh
dotnet test backend/BurgerHouse.sln -c Release
dotnet build backend/BurgerHouse.sln -c Release
npm test
npm run typecheck
npm run lint
npm run build
npm run e2e
```

Referências oficiais: [criar checkout](https://developer.pagbank.com.br/dk/reference/criar-checkout), [webhooks do checkout](https://developer.pagbank.com.br/reference/webhooks-checkout), [consultar cobrança](https://developer.pagbank.com.br/reference/consultar-pagamento) e [validar autenticidade](https://developer.pagbank.com.br/reference/validacao-de-autenticidade).
