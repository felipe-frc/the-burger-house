# PagBank

O PagBank é o único provedor de pagamento do runtime atual. O backend mantém a identidade e o estado do pagamento localmente; o navegador apenas recebe a URL HTTPS do checkout hospedado.

## Configuração

Configure estas variáveis fora do repositório:

| Variável | Finalidade |
| --- | --- |
| `PagBank__BaseUrl` | Base HTTPS da API PagBank, como `https://sandbox.api.pagseguro.com` no Sandbox |
| `PagBank__Token` | Token da aplicação PagBank |
| `PagBank__RedirectUrl` | URL HTTPS pública para a qual o checkout retorna o cliente |
| `PagBank__NotificationUrl` | URL HTTPS pública terminando em `/api/webhooks/pagbank` |

Os arquivos `appsettings` versionados não contêm token real. No Azure, o SQLite persistente usa `Data Source=/home/burgerhouse.db`; o diretório `/home` precisa permanecer persistente.

## Checkout hospedado

`POST /api/checkout/{orderId}` cria ou reutiliza o `Payment` local pendente, envia ao PagBank uma requisição de checkout com `reference_id = payment:{Payment.Id}` e persiste o identificador `CHEC_...` em `ExternalCheckoutId`.

A resposta pública contém somente:

```json
{
  "paymentId": 123,
  "checkoutUrl": "https://pagamento.pagbank.com.br/..."
}
```

O backend e o frontend aceitam apenas URLs HTTPS sem `userinfo` nos hosts `pagamento.pagbank.com.br` e `pagamento.sandbox.pagbank.com.br`.

## Webhook financeiro

`POST /api/webhooks/pagbank` é o mecanismo principal de sincronização. O controller lê o corpo bruto, valida `x-payload-signature` com SHA-256, ECDSA e a chave pública obtida no endpoint oficial de chaves do PagBank, e só depois desserializa o evento.

Eventos financeiros devem conter o objeto externo `ORDE_...`, `reference_id` e `charges[]`. Cada charge candidata precisa ter identificador `CHAR_...`, referência `payment:{Payment.Id}`, valor igual ao pagamento local, moeda `BRL`, status reconhecido e, quando liquidada, método reconhecido.

Um pedido externo pode conter várias tentativas. Se `ExternalPaymentId` já estiver preenchido, somente a charge com o mesmo ID pode ser usada. Caso contrário, a seleção exige exatamente uma charge válida na primeira categoria encontrada: `PAID`; depois `AUTHORIZED`, `IN_ANALYSIS` ou `WAITING`; por fim `DECLINED` ou `CANCELED`. Duas charges `PAID` válidas são tratadas como ambiguidade.

A charge selecionada é confirmada por `GET /charges/{CHAR_...}` antes de iniciar a transação local. A transação curta recarrega `Payment` e `Order`, repete as correlações dependentes do estado atual e grava os dois de forma atômica. Webhooks repetidos são idempotentes e não substituem um `ExternalPaymentId` existente.

No Sandbox, a entrega automática da notificação pode não ocorrer. Nesse caso, use o recurso oficial de reenvio ou simulação de notificação do ambiente PagBank; a aplicação não tenta descobrir `CHAR_...` consultando o checkout `CHEC_...`.

## Consulta de status

`GET /api/payments/{paymentId}` retorna o estado local. Quando `ExternalPaymentId` ainda não existe, nenhuma chamada ao provedor é feita. Depois que um `CHAR_...` foi persistido, o backend pode consultar diretamente `GET /charges/{ExternalPaymentId}` e reconciliar o estado.

Falhas ou respostas inválidas nessa consulta não alteram o banco e o endpoint mantém o último estado local conhecido. Pagamentos em estado terminal sem necessidade de reconciliação não geram chamada externa.

## Identificadores persistidos

- `ExternalCheckoutId`: ID `CHEC_...` retornado na criação do checkout hospedado.
- `ExternalPaymentId`: ID `CHAR_...` recebido em evento financeiro e confirmado pela consulta direta da charge.

O código não converte `CHEC_...` ou `ORDE_...` em `CHAR_...` e não tenta inferir uma charge por manipulação de identificadores.
