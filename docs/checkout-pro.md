# Pagamentos com Checkout Pro

O backend cria o pedido e uma tentativa `Payment Pending + Unknown`. Depois de salvar a tentativa, cria uma Preference com `external_reference = Payment.Id`. O navegador abre o `initPoint`; toda escolha de método ocorre no Mercado Pago.

O webhook valida a assinatura, consulta `GET /v1/payments/{id}` e verifica ID, referência, pedido, valor e moeda BRL antes de alterar o banco. Payment e Order compartilham o DbContext e são gravados na mesma transação. Aprovação move o pedido de `PendingPayment` para `Received` (recebido pelo restaurante).

## Endpoints

| Método | Rota | Responsabilidade |
|---|---|---|
| POST | `/api/orders` | Criar pedido com preços do backend |
| POST | `/api/checkout/{orderId}` | Preparar tentativa e criar/reutilizar Preference |
| GET | `/api/payments/{paymentId}` | Consultar exclusivamente o estado local |
| POST | `/api/webhooks/mercadopago` | Confirmar e sincronizar um pagamento |

O GET recebe o ID do **Payment**, não o ID do Order. Os antigos endpoints de criação direta de pagamento, cartão e PIX foram removidos.

## Configuração

Configure os segredos somente via User Secrets ou variáveis de ambiente:

- `MercadoPago__AccessToken`: credencial da aplicação correta.
- `MercadoPago__WebhookSecret`: secret do webhook dessa mesma aplicação; não reutilizar por suposição o secret de outra integração.
- `MercadoPago__ReturnUrl`: URL HTTPS do frontend. O appsettings de produção usa a raiz pública existente da Vercel; Development não define retorno público.
- `MercadoPago__NotificationUrl`: URL HTTPS pública do backend terminando em `/api/webhooks/mercadopago`, ou configurar a notificação no painel da aplicação. Não há URL fictícia no código.
- `Cors__AllowedOrigins__0`: origem do frontend autorizado.
- `VITE_API_BASE_URL`: endereço público do backend usado pelo frontend publicado. Em desenvolvimento, o fallback é `http://localhost:5041`.

Sem backend HTTPS público e webhook configurado, pagamentos não serão confirmados automaticamente. Não houve deploy nem pagamento real durante esta migração. Um retorno completo durante desenvolvimento exige frontend e backend públicos apropriados; localhost não é configurado como retorno público. O retorno deve usar a mesma origem/aba que iniciou o checkout para recuperar o sessionStorage.

## Preference e concorrência

Somente `ExternalPreferenceId` é armazenado. Repetições recuperam a Preference pelo SDK e retornam sua URL atual; não armazenamos uma cópia de `initPoint`. Preference expirada/incompatível é recusada, sem criar outra cobrança silenciosamente.

O ID local é confirmado no banco antes da criação externa da Preference. Transações SQLite não diferidas serializam sua criação/reutilização. No webhook, a assinatura e a resposta da Payments API são validadas antes de abrir a transação. Depois do lookup HTTP, uma transação curta e não diferida recarrega Payment e Order, repete as validações que dependem do estado atual, aplica as transições e grava ambos atomicamente. Webhooks concorrentes são serializados nessa etapa local, sem manter trava de banco durante a chamada ao provedor.

Não existe transação distribuída com o Mercado Pago: se o provedor criar uma Preference e a conexão/processo falhar antes de armazenar seu ID, o resultado fica incerto. A garantia testada é reutilização após persistência e serialização de chamadas concorrentes; não prometemos exactly-once remoto nessa janela de falha. O Payment local já persistido não é apagado.

Um Payment não troca de ExternalPaymentId. Um segundo ID incompatível é recusado para não corromper a tentativa. Depois de uma tentativa rejeitada/cancelada, a nova chamada de checkout pode criar outro Payment para o pedido ainda pendente. Múltiplos pagamentos gerados dentro da mesma Preference não são fundidos silenciosamente.

## Métodos e estados

Métodos: `Unknown=0`, `Pix=1`, `CreditCard=2`, `DebitCard=3`, `AccountMoney=4`, `PrepaidCard=5`. Os tipos `ticket`, `atm` e `digital_currency` são excluídos da Preference. Um método ausente, não suportado ou incoerente nunca aprova a tentativa.

Estados: `Pending=1`, `Approved=2`, `Rejected=3`, `Cancelled=4`, `Refunded=5`, `PartiallyRefunded=6`, `ChargedBack=7`. Reembolso/chargeback mantêm seu significado financeiro e não cancelam automaticamente a execução de um pedido. Se a primeira notificação já indicar reembolso/chargeback, o pedido não é liberado para preparo. Eventos incompatíveis são recusados; notificações repetidas não refazem transições.

## Retorno e WhatsApp

O sessionStorage preserva IDs locais, resumo, mensagem, endereço e observações necessários ao retorno. Parâmetros como `status=approved` e `payment_id` da URL não aprovam nada. O frontend consulta o Payment local salvo e confere pedido e valor. Enquanto estiver pendente, oferece consulta manual; não há polling específico de PIX.

O WhatsApp só é disponibilizado após aprovação confirmada pelo backend e exige uma ação do cliente. Antes de abrir a mensagem, o status é consultado novamente. Um carrinho diferente, montado enquanto o pagamento anterior estava em andamento, não é apagado.

## Banco e histórico

`20260916232938_AddCheckoutPreference` foi aplicada ao SQLite local em 17/09/2026 após backup e é aditiva: cria uma coluna nullable e um índice único. Não renomeia `ExternalOrderId` para `ExternalPreferenceId`: são identificadores de recursos diferentes.

O domínio, repository e modelo EF deixaram de depender de `ExternalOrderId`. A coluna e seu índice históricos continuam fisicamente no SQLite por decisão explícita de preservação. O snapshot descreve o modelo atual; essa diferença física é intencional. Cuidado com futuras migrations que reconstruam a tabela: elas devem preservar ou arquivar esses dados antes de qualquer rebuild.

A auditoria inicial encontrou 13 pagamentos aprovados com vínculo antigo e 9 pagamentos pendentes com método conhecido. Nenhum desses pagamentos foi apagado, cancelado ou convertido automaticamente. Uma tentativa antiga com método conhecido bloqueia um novo checkout para o mesmo pedido, evitando cobrança duplicada. Os pedidos históricos não foram retroativamente avançados sem reconciliação.

**Limpeza destrutiva proposta, não executada:** exportar/backupear os 13 vínculos, reconciliar as tentativas antigas, e só então criar uma migration separada para remover `IX_Payments_ExternalOrderId` e a coluna. As migrations antigas permanecem intactas.

A comparação após aplicação confirmou que todas as colunas anteriores de Payments, Orders e OrderItems continuam idênticas ao backup. Backup local: `C:\Users\mfeli\AppData\Local\Temp\burger-house-before-checkout-pro-20260917.db`.

O teste `CheckoutMigrationTests` aplica a migration sobre um banco temporário com dado legado e verifica sua preservação no upgrade e no rollback. Os testes nunca acessam o Mercado Pago real.

## Verificação

```sh
dotnet test backend/BurgerHouse.sln -c Release
dotnet build backend/BurgerHouse.sln -c Release
npm test
npm run typecheck
npm run lint
npm run build
npm run e2e
```

Release evita conflito com a API local que estava executando DLLs de Debug. O processo já aberto precisa ser reiniciado para carregar a implementação nova.

Referências oficiais: [notificações](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications), [meios de pagamento](https://www.mercadopago.com.br/developers/pt/docs/sales-processing/payment-methods), [exclusões](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/additional-settings/payment-methods), [retorno](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/configure-back-urls).
