# The Burger House — portfólio local, Release 1.0

## Endereço e arquitetura

O uso diário ocorre somente em `https://127.0.0.1:55485`: `/menu` oferece vitrine e checkout; `/admin/` oferece o Owner. O gateway HTTPS encaminha `/api` para `http://127.0.0.1:55484`. A API .NET 9 usa EF Core/Npgsql e PostgreSQL 18.1, em `127.0.0.1:55482`, banco `tbh_portfolio_dev`, role `tbh_portfolio_dev_role`. React/TypeScript/Vite e os componentes existentes foram preservados. O navegador nunca recebe conexão do banco nem token PagBank.

Os testes de escrita usam SQLite temporário ou schemas exclusivos de `tbh_migration_lab`. O antigo ambiente SQLite continua preservado; não é necessário iniciá-lo para usar o produto. Seus pedidos não são copiados para o PostgreSQL. Cada estabelecimento futuro deve ter banco, API, chaves, conta Owner e credenciais de pagamento independentes.

## Instalação

Pré-requisitos: Windows com PowerShell 7 para o launcher DPAPI, Node 24+, npm, SDK e runtime ASP.NET .NET 9, PostgreSQL 18.1, Python 3 com `psycopg[binary]==3.3.2` para importação e Chrome para E2E. Instale as dependências na raiz, `frontend/` e `owner-ui/` com `npm ci`, `npm ci --prefix frontend`, `npm ci --prefix owner-ui`; execute `dotnet restore backend/BurgerHouse.sln` e, em `backend/`, `dotnet tool restore`.

Uma instalação **nova e vazia** exige criar a role `tbh_portfolio_dev_role` e o banco `tbh_portfolio_dev` pertencente a ela no PostgreSQL local da porta **55482**. Defina a senha via `\password tbh_portfolio_dev_role` no psql privado. Não use o perfil ou os dados de outra pessoa. Configure a sessão privada e execute uma única vez:

```powershell
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '55482'
$env:PGDATABASE = 'tbh_portfolio_dev'
$env:PGUSER = 'tbh_portfolio_dev_role'
$env:PGPASSWORD = [Net.NetworkCredential]::new('', (Read-Host 'Senha PostgreSQL' -AsSecureString)).Password
pwsh -File scripts/admin/portfolio-local.ps1 -Mode Init -Python python
Remove-Item Env:PGPASSWORD
```

`Init` é provisionamento explícito: aplica as quatro migrations PostgreSQL, importa uma fixture SQLite sintética, prepara catálogo e Owner demonstrativos e gera certificado local. Não execute em banco existente. O launcher recusa repetir Init no perfil já importado. Consulte [migração e operação](postgresql-operacao.md) para outra plataforma, verificação do importador e implantação futura; os componentes da aplicação não dependem de DPAPI.

O perfil local `.test-tmp/portfolio-dev/profile.xml` contém segredos protegidos por Windows DPAPI. Esse diretório, bancos, certificados, logs, artefatos e user-secrets ficam fora do Git. Preserve a chave de criptografia e o key ring existentes; trocá-los impede ler dados e sessões anteriores. O certificado é somente local. Siga o [guia de HTTPS](https-local.md) e autorize a CA do usuário antes de navegar. Não ignore erros TLS.

## Credencial PagBank própria

Obtenha uma credencial **sandbox** individual. No terminal privado, informe-a interativamente, sem imprimir seu valor:

```powershell
$secret = Read-Host 'Token PagBank Sandbox' -AsSecureString
$value = [Net.NetworkCredential]::new('', $secret).Password
@{ 'PagBank:SandboxToken' = $value; 'PagBank:BaseUrl' = 'https://sandbox.api.pagseguro.com' } |
    ConvertTo-Json -Compress | dotnet user-secrets set --project backend/BurgerHouse.Api
$value = $null
```

O comando lê JSON de stdin, sem inserir o token nos argumentos ou no histórico. User Secrets é armazenamento local privado, não criptografado; restrinja as permissões do usuário. Nunca publique esse arquivo. O launcher prefere `PagBank:SandboxToken`, aceita a configuração privada antiga `PagBank:Token` e recusa uma origem privada diferente de sandbox.

## Inicialização diária

```powershell
pwsh -NoProfile -File scripts/admin/portfolio-local.ps1
```

Este é o comando oficial. Verifica dependências, perfil, porta PostgreSQL e conflitos; compila API e fixture em diretórios novos; empacota vitrine e Owner; inicia a API e depois o gateway. Não sobrescreve DLL carregada, não muda senhas, não importa dados e não aplica migrations. Um segundo launcher é recusado. `Ctrl+C` sinaliza parada pelos canais privados stdin dos dois processos criados; após o prazo, encerra somente seus próprios filhos. PostgreSQL permanece ativo.

O modo é explicitamente Homologation/Portfolio, com API e banco loopback fixos, retorno local fixo e webhooks sem assinatura sempre proibidos. Antes de escutar, a API faz GET autenticado de uma referência sandbox nova inexistente: somente HTTP 404 habilita a capacidade de checkout. HTTP 401/403, redirecionamento ou falha de rede interrompem o início. Nenhuma cobrança é criada nesse teste. O gateway verifica provider, banco e identidade do diretório em cada chamada à API; checkout persistente exige também a capacidade autenticada validada pela API. `PUBLIC_READY` ou um parâmetro do navegador não bastam.

Sem credencial ou sem acesso ao provedor:

```powershell
pwsh -NoProfile -File scripts/admin/portfolio-local.ps1 -Offline
```

Esse é o mesmo site, API e PostgreSQL. Catálogo e Owner continuam reais; checkout externo e os workers de consulta financeira ficam desabilitados explicitamente. Não há pagamentos ficticiamente aprovados. Os testes com provedor controlado continuam disponíveis sem credenciais externas.

## Acesso ao Owner

E-mail da fixture: `owner.homologation@example.invalid`. Não existe senha pública fixa. Cada instalação gera a sua. Para copiar a senha do perfil local sem imprimi-la:

```powershell
pwsh -File scripts/admin/portfolio-local.ps1 -Mode CopyOwnerPassword
```

Use somente em terminal privado e limpe a área de transferência depois. Este comando não redefine a senha. A conta local acessa os dados persistentes; os testes usam contas próprias descartáveis. Cookies HttpOnly/Secure/SameSite Strict e proteção CSRF permanecem ativos. O refinamento final da sacola, sessão e CI está documentado no README e no guia de HTTPS.

Para definir seu próprio e-mail e senha, execute **somente quando desejar autorizar a alteração**, em terminal privado interativo:

```powershell
pwsh -NoProfile -File scripts/admin/portfolio-local.ps1 -Mode OwnerCredentials
```

O comando compila o código atual, solicita e-mail e senha sem eco no terminal, confirma a senha e exige digitar `ALTERAR` antes de salvar. Use uma senha exclusiva de 14 a 128 caracteres. A operação atualiza o único Owner existente, preserva seu ID, revoga todas as sessões administrativas e não executa migrations nem inicia outra API. Pedidos, pagamentos e configurações permanecem intactos. Conta ausente ou ambígua causa erro, sem criação de outro administrador.

Após o sucesso, a senha pessoal existe somente como hash no PostgreSQL; a senha demonstrativa reversível é retirada do perfil DPAPI. As demais configurações protegidas são preservadas. `CopyOwnerPassword` deixa de estar disponível nesse perfil. Entre novamente em `https://127.0.0.1:55485/admin/` com suas novas credenciais. Não coloque seu e-mail, senha ou perfil local no Git, em comandos, logs ou exemplos públicos.

## Demonstração manual segura

1. Abra `/menu`, confira produtos, preços e disponibilidade da API, selecione itens/adicionais e escolha entrega ou retirada. Use somente identidade de teste e endereço fictício adequado ao sandbox. Cupons são aceitos apenas quando cadastrados e válidos.
2. Revise o total calculado pelo backend e envie uma única vez. O pedido e a tentativa de pagamento são persistidos antes do checkout. Em erro, utilize **Retomar pagamento**; não crie outro pedido para contornar a falha.
3. No modo local, o checkout sandbox abre em outra aba. O PagBank rejeita callbacks loopback; a API omite essas URLs, preservando a aba original. Volte para a loja após o ensaio. Se popups estiverem bloqueados, o navegador usa o redirecionamento anterior; voltar pelo histórico recupera a sessão.
4. O foco da aba e **Consultar pagamento** acionam a consulta autenticada. Uma tela de sucesso, parâmetros de retorno ou payload sem assinatura nunca comprovam pagamento. Sem webhook público, a conciliação existente consulta checkout, pedido e cobrança canônica, conferindo referências, moeda, valor e método. O worker processa até cinco pendentes por minuto, com cursor rotativo. A atualização depende da disponibilidade do sandbox.
5. Abra o Owner **na mesma origem**, confira pedido e dados financeiros e execute as transições permitidas. Retirada percorre preparo, conferência e conclusão; delivery inclui checklist, despacho, responsável quando existente e entrega. Nenhum status financeiro deve ser editado manualmente.

Não use cartões reais. Um checkout sandbox criado não comprova pagamento Pix ou crédito aprovado. Webhook público, callbacks hospedados e homologação comercial exigem infraestrutura e autorização posteriores.

## Testes reproduzíveis

```powershell
npm run typecheck
npm --prefix owner-ui run lint
npm test
npm run test:frontend
npm --prefix owner-ui test
npm run test:integration
npm run test:owner:e2e
dotnet test backend/BurgerHouse.sln -c Release
node --test tests/homologation-static.test.mjs tests/portfolio-checkout-policy.test.mjs
python scripts/check-publication.py --history
```

O último comando é um gate de publicação: deve falhar enquanto existirem caminhos privados no histórico. Não é falha funcional da aplicação.

Para testes PostgreSQL, crie uma role/banco **separados** `tbh_lab`/`tbh_migration_lab` no loopback, sem privilégios sobre o banco principal. Forneça `TBH_POSTGRES_FLOW` privadamente como conexão Npgsql desse laboratório. Os testes geram schemas `flow_<guid>` e conferem migrations, estados, concorrência, assinatura, idempotência, estornos e reinício. A configuração recusa o banco principal. Com `TBH_BROWSER_WITH_CONTROLLED_PROVIDER=1`, os dois casos `StorefrontFlowTests.CatalogOrderCheckoutSignedWebhookAndAdminFulfillment` também executam Chromium e provedor controlado. `TBH_BROWSER_APPROVED_CATALOG=1` e `TBH_BROWSER_CUSTOMIZATIONS=1` exercitam o catálogo completo, adicional e cupom sintético.

`node tests/owner-browser-sqlite.mjs` exercita as mutações do Owner com SQLite descartável. Para PostgreSQL, defina `TBH_OWNER_BROWSER_POSTGRES=1`, libpq `PGHOST=127.0.0.1`, porta do laboratório, `PGDATABASE=tbh_migration_lab`, `PGUSER=tbh_lab` e senha privada. `TBH_IMPORT_PYTHON` e `TBH_PSQL` selecionam os executáveis instalados. Esse runner importa uma fixture própria em schema `owner_<guid>` e nunca consulta o principal.

O teste externo `ExternalSandboxCheckoutTests` exige opt-in `TBH_EXTERNAL_SANDBOX=1`, `TBH_SANDBOX_TOKEN` privado e `TBH_POSTGRES_FLOW` do laboratório. Cria exatamente um checkout **não pago** no sandbox, verifica reuso/persistência e remove apenas seu schema descartável. Não confirma cobranças, não substitui os testes controlados e não usa `tbh_portfolio_dev`. Sem opt-in, aparece como ignorado.

## Publicação e limitações

O projeto local não equivale a uma implantação pública. Nenhum recurso Azure, deploy, commit ou push integra este procedimento. O frontend não depende de credenciais pessoais para compilar. Mapas externos exigem chave própria restrita por origem; falhas têm tratamento explícito.

O histórico Git contém capturas antigas com endereços preenchidos e procedência não comprovada. Os arquivos já foram retirados do índice autorizado, mas versões anteriores continuam alcançáveis. Gitleaks não detecta dados pessoais em pixels. **Publicação bloqueada** até decisão do titular sobre consentimento e saneamento do histórico. Não enviar refs privados nem usar mirror. O inventário atual não encontrou blobs acima de 100 MiB entre os objetos alcançáveis; isso não certifica objetos inacessíveis ou conteúdos comprimidos.

Plano, sem executar: revisar todos os refs destinados à publicação; decidir entre história pública nova, previamente sanitizada, ou reescrita autorizada. Uma história nova perde a navegação pública dos commits antigos. Reescrita altera hashes, invalida referências e exige coordenação com clones existentes. Ambas exigem autorização específica e nova auditoria de texto, imagens, segredos, direitos de assets e CI/CD. Nenhuma alteração de índice ou histórico está autorizada por este guia. Antes de publicar, revisar workflows e integrações que possam disparar deploy.
