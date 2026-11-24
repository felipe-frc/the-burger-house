# Segurança e privacidade — demonstração local

Este projeto é portfólio com PagBank Sandbox. As páginas `/privacy.html`, `/terms.html` e `/cancellation.html` são minutas. Identidade empresarial, contato de privacidade, hipóteses legais e retenção precisam de validação humana. Não equivalem a conformidade jurídica, LGPD ou WCAG integral.

## Acesso a pedidos e pagamentos

`POST /api/orders` devolve `orderAccessToken`, emitido pela API via ASP.NET Data Protection, com finalidade separada da sessão Owner e validade de sete dias. `POST /api/checkout/{id}` e `GET /api/payments/{id}` exigem `X-Order-Access` correspondente ao pedido. Identificadores numéricos isolados não autorizam operações. O token não deve aparecer em URL, logs, analytics ou mensagens. O frontend preserva esse vínculo em sessão e comprovante mínimo local.

Sessões antigas sem prova não são convertidas por CPF, e-mail ou número de pedido. Permanecem com histórico e link de pagamento preservados, com aviso de verificação administrativa. Atualizar API e frontend deve ser coordenado; um frontend antigo não fornece esse cabeçalho.

A Data Protection usa o key ring existente. Novas chaves Windows com caminho explícito recebem DPAPI do usuário atual. Isso não reescreve nem rotaciona chaves antigas. Antes de hospedar em Linux, definir proteção explícita do key ring, acesso mínimo e persistência; não presumir que configurar uma pasta criptografa o XML.

## Solicitações de titulares

Módulo opcional, desligado por padrão em `Privacy:RequestsEnabled`. Requer `Privacy:ControllerName`, `Privacy:PrivacyContact`, `Privacy:RetentionPolicyVersion` e a migration própria. `BusinessId` e `BusinessAddress` permanecem pendentes até informação verificada; nunca preencher com dados pessoais do Owner. O campo empresarial não substitui análise da situação jurídica do projeto.

`PrivacyDbContext` compartilha conexão e transação com o contexto operacional, mas utiliza `__PrivacyEFMigrationsHistory`. Assim, preparar o módulo não altera o contrato das migrations operacionais nem exige atualizar o banco diário. Não há migration automática desse módulo no startup.

Rotas:

- `GET /api/privacy/config`: somente configuração pública e disponibilidade.
- `POST /api/privacy/requests`: UUID idempotente, tipo de direito e pedido verificado; contato corrigido apenas quando solicitado.
- `GET /api/privacy/requests/{uuid}`: status exclusivamente da compra comprovada.
- `GET /api/privacy/orders/{id}/export`: exportação mínima do próprio pedido, sem tokens, chave de pagamento, hash ou informações de outros compradores.
- `/api/admin/privacy/requests`: fila paginada e detalhes protegidos por Owner. Mutações `/review` exigem CSRF, revisão esperada e decisão explícita.

A interface pública fica em `/rights.html`; a fila administrativa está em **Configurações → Solicitações de privacidade**, sem novo módulo principal. Uma prova expirada ou indisponível exige verificação pelo contato legítimo de privacidade; esse contato ainda precisa ser definido. Não foi criado login de clientes.

Correções propostas são criptografadas por AES-GCM com propósito próprio. A fila não exibe esses dados; somente o detalhe Owner autorizado os abre para revisão. Decisões são tipadas e persistidas com operador, revisão e horário em `PrivacyDecisions`, sem snapshots pessoais no audit trail. Há transação compartilhada, controle de concorrência e coordenação PostgreSQL por pedido.

Minimização exige pedido encerrado, ausência de pagamento pendente/contestação, avaliação humana da retenção e confirmação `MINIMIZAR`. Limpa identificadores locais, endereço e observações, preservando IDs, valores, linhas, pagamentos, estornos e trilha administrativa. Não significa anonimização irreversível nem eliminação de todas as cópias externas. Não há descarte automático ou exclusão em massa. Retenções legais, histórico de comunicações e cópias de terceiros precisam de revisão individual.

### Preparar SQL sem acessar banco

Com ferramentas EF compatíveis e dependências restauradas:

```powershell
dotnet ef migrations script --context PrivacyDbContext --project backend/BurgerHouse.Infrastructure --startup-project backend/BurgerHouse.Api --output .test-tmp/privacy-schema.sql
```

A factory de design não usa o perfil diário nem executa `Program`. A conexão de design sem senha é não funcional e serve apenas para geração de SQL. O script cria duas tabelas e seu histórico, com chaves estrangeiras restritivas. Não modifica `Orders`, `Payments` ou migrations operacionais.

**Não aplicar no banco principal sem autorização.** Uma futura execução autorizada precisa fornecer a conexão privadamente em `TBH_PRIVACY_MIGRATION_CONNECTION` e confirmar `TBH_PRIVACY_SCHEMA_CHANGE_AUTHORIZED=YES`, revisar o SQL e só então executar `dotnet ef database update --context PrivacyDbContext ...`. Não coloque conexão com senha em comandos, arquivos publicáveis ou histórico de shell. Não execute rollback que apague registros: a migration não oferece remoção automática de dados.

## Consentimento e integrações

Preferências locais versionadas, com 180 dias de validade técnica: essenciais sempre disponíveis; mapa e analytics inicialmente desligados. Aceitar, rejeitar, personalizar e revogar ficam disponíveis sem bloquear checkout. A revogação do mapa desmonta o componente e interrompe novas consultas. Fontes são servidas pela própria origem; licenças OFL acompanham os arquivos canônicos em `owner-ui/public/fonts`.

GA4 só inicia com `VITE_ANALYTICS_ENABLED=true`, um `VITE_GA4_MEASUREMENT_ID` legítimo, consentimento e ausência de DNT/GPC. A CSP do pacote também precisa de `BURGER_BUILD_GA4_MEASUREMENT_ID` explícito e correspondente. Não foi criada propriedade externa. Manter desativado até verificar propriedade, contrato, retenção e desabilitar coleta automática/enhanced measurement na administração do GA4. Não habilitar Google Signals, publicidade, user_id ou parâmetros pessoais.

Eventos permitidos: `view_menu`, `add_to_cart`, `begin_checkout`, `demo_purchase`. O último só ocorre após confirmação confiável de pagamento, é identificado como demonstração, sem receita, valor ou ID transmitido e com coordenação local entre abas. Não se emite evento financeiro real `purchase`. URLs de eventos não incluem query, fragmento ou referrer. Sem coordenação segura, o evento opcional é omitido.

Contatos WhatsApp e formulário de recrutamento dependem de `VITE_PUBLIC_WHATSAPP_VERIFIED=true` e número empresarial público verificado em `VITE_PUBLIC_WHATSAPP_NUMBER`. Por padrão, contato indisponível; recrutamento não coleta currículo ou dados pessoais para um número fictício. Nenhum contato é derivado da identidade do administrador.

## Webhooks

Contrato implementado: assinatura ECDSA/SHA-256 `x-payload-signature` sobre bytes originais, chave X.509 obtida em `/public-keys/webhook` (conforme `consultar-chave-publica` e retorno HTTP 200 validado no Sandbox em 27/10/2026; o guia `validacao-de-autenticidade` ainda menciona `?type=webhook`, que retornou 403 nesse ambiente em 27/10/2026). Valida antes de JSON e alterações financeiras; Sandbox não autoriza webhook sem assinatura. A opção antiga de bypass é ignorada. Corpo limitado a 256 KiB, inclusive transferência sem Content-Length. Cache de chave uma hora; renovação forçada tem intervalo mínimo de 30 segundos. Assinatura legítima de chave recém-rotacionada durante esse intervalo pode exigir nova entrega; nunca liberar sem validação.

A API tradicional com `x-authenticity-token` é outro contrato: não é fallback automático. Confirmar com evento autêntico e documentação da conta antes de qualquer publicação hospedada. O endereço loopback não recebe callbacks públicos. Testes controlados não comprovam webhook externo real. Correlação, valor, BRL, estado, conciliação e idempotência permanecem no backend.

## Publicação

Nenhum commit, push, deploy ou alteração remota é executado por esta preparação. CI e deploy manual já separados continuam assim. Páginas locais, Owner e documentos jurídicos têm noindex; robots bloqueia indexação. Nenhum domínio canônico foi inventado. Uma futura origem HTTPS verificada exige metadados absolutos, sitemap e política de indexação conscientes antes de publicar.

Quatro capturas históricas continuam bloqueadas por possível informação pessoal: `address.png`, `endereco.png`, `review.png`, `revisao.png`. Gitleaks não substitui revisão de imagens ou autoria. Origem/licença de materiais visuais não comprovada impede autorização de publicação desses materiais. Não apagar imagens ou reescrever histórico automaticamente.

Referências técnicas: [PagBank ECDSA](https://developer.pagbank.com.br/reference/validacao-de-autenticidade), [contrato tradicional](https://developer.pagbank.com.br/reference/confirmar-autenticidade-da-notificacao), [checkout](https://developer.pagbank.com.br/reference/objeto-checkout), [Data Protection](https://learn.microsoft.com/aspnet/core/security/data-protection/implementation/key-encryption-at-rest?view=aspnetcore-9.0), [EF design-time](https://learn.microsoft.com/ef/core/cli/dbcontext-creation), [consentimento Google](https://developers.google.com/tag-platform/security/guides/consent), [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
