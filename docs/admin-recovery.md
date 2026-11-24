# Recuperação do acesso administrativo

A aplicação possui comandos administrativos para criação e recuperação do Owner.

## Criar o primeiro Owner

Execute somente em ambiente privado e interativo:

~~~powershell
dotnet run --project .\backend\BurgerHouse.Api\BurgerHouse.Api.csproj -- --create-owner
~~~

O comando solicita o e-mail e a senha de forma interativa.

## Redefinir a senha do Owner

Para recuperar o acesso administrativo:

~~~powershell
dotnet run --project .\backend\BurgerHouse.Api\BurgerHouse.Api.csproj -- --reset-owner-password
~~~

A nova senha:

- deve possuir entre 14 e 128 caracteres;
- é digitada de forma oculta;
- precisa ser confirmada;
- não deve ser informada como argumento de linha de comando.

Após o reset:

- o hash da senha do Owner é substituído;
- todas as sessões administrativas são revogadas;
- é necessário realizar novo login.

## Recuperação em produção no Azure App Service

Execute apenas após autorização explícita do proprietário. Não envie a senha pelo chat.
Na implementação atual, `--reset-owner-password` é processado antes das migrations,
opera somente no banco existente e não inicia o servidor HTTP. Uma publicação anterior
pode executar migrations antes do comando: confirme a versão publicada antes da recuperação.
Esta sessão não executou reset, reinício nem migrations no Azure.

1. Abra o App Service `the-burger-house-api` no Azure Portal.
2. Abra a sessão SSH.
3. Acesse o diretório publicado:

~~~bash
cd /home/site/wwwroot
~~~

4. Confirme que a aplicação está presente:

~~~bash
ls BurgerHouse.Api.dll
~~~

5. Execute:

~~~bash
dotnet BurgerHouse.Api.dll --reset-owner-password
~~~

6. Digite a nova senha.
7. Confirme a mesma senha.
8. Aguarde a mensagem:

~~~text
Owner password reset. All administrative sessions were revoked.
~~~

9. Faça login novamente no painel administrativo.

Nunca coloque a senha diretamente no comando, no repositório ou em arquivos versionados.

## Recuperação isolada quando a implantação antiga migra antes do reset

Este procedimento só pode ser usado após autorização explícita de recuperação.
Ele não publica nem substitui a aplicação e não reinicia o App Service.

O utilitário `backend/tools/OwnerRecoveryHost` carrega as bibliotecas da implantação
existente e chama o método oficial `BurgerHouse.Api.Admin.AdminSecurity.ResetOwnerPasswordAsync`.
Não chama `Program.Main`, `Database.Migrate`, `EnsureCreated`, SQL de alteração de
senha, criação de proprietário ou inicialização do servidor HTTP.

Antes de solicitar uma senha ele exige:

- aplicação, banco existente e backup distinto presentes;
- conexão SQLite em `ReadOnly` na verificação e `ReadWrite` somente no reset,
  sem criação de banco inexistente;
- zero migrations pendentes, consultadas sem aplicação de schema;
- exatamente um Owner existente;
- verificação rápida do arquivo de backup já validado;
- terminal privado interativo, sem entrada redirecionada.

O contexto usado pelo utilitário recusa qualquer leitura ou escrita de campos
pessoais criptografados. Não lê, troca ou imprime a chave de criptografia de produção.
A rotina oficial solicita a nova senha e confirmação com entrada oculta. A mudança
do hash e a revogação das sessões são feitas exclusivamente por `AdminIdentity`.
Contagens de produtos, pedidos, itens, pagamentos, estornos, auditoria e proprietários
são conferidas antes/depois; as sessões de login são revogadas pelo mecanismo oficial.

Preparação local, sem deploy:

```powershell
dotnet build backend/tools/RecoveryInspector/RecoveryInspector.csproj --artifacts-path backend/artifacts/recovery-tools
dotnet build backend/tools/OwnerRecoveryHost/OwnerRecoveryHost.csproj --artifacts-path backend/artifacts/recovery-tools
& ./scripts/admin/build-recovery-handoff.ps1
```

O arquivo gerado `test-results/azure-owner-recovery-private.sh` contém os utilitários
com hashes SHA256, sem credenciais. O modo padrão é `--inspect-only`: não pede senha
nem executa reset. Somente `--reset-owner-password` permite a recuperação.
Não use uma cópia antiga que prosseguia automaticamente após as verificações.
Para transferir o arquivo completo por HTTPS autenticado, conferir integridade e
executar cada etapa separadamente, siga [o procedimento revisado](owner-recovery-transfer-2026-10-27.md).
Arquivos temporários ficam em `/home/bh-owner-recovery.*`, fora da implantação.
O comando é específico para `/home/burgerhouse.db` e para o backup confirmado pelo
proprietário nesta operação:
`/home/backups/burgerhouse-before-owner-reset-20261027-200847.db`.

Não capture nem compartilhe a digitação da senha. Compartilhe apenas os resultados
JSON sem segredos. Em caso de `blocked-preflight` ou `RECOVERY_STOPPED`, não tente
forçar o reset nem executar migrations: confira a causa antes de prosseguir.

Após resultado `recovered`, valide a autenticação e o cadastro autorizado em terminal
privado local, digitando a senha nova quando solicitada:

```powershell
& ./scripts/admin/register-production-products.ps1 -Mode Apply
```

O cadastro interrompe imediatamente em 401, confere duplicidades antes de cada POST,
registra os IDs retornados e compara os dados administrativos e públicos após cada
criação. Nenhum produto histórico é atualizado ou removido. O relatório sem segredos
fica em `test-results/production-catalog-registration.json`.

## Data Protection no Azure App Service

No Azure App Service, o ASP.NET Core utiliza o armazenamento persistente padrão de Data Protection em:

~~~text
/home/ASP.NET/DataProtection-Keys
~~~

O App Service não precisa da configuração `Admin__DataProtectionPath`.

A aplicação continua oferecendo suporte a `Admin:DataProtectionPath` para ambientes que precisem definir explicitamente outro local.

A persistência do key ring padrão foi validada em produção reiniciando o App Service e confirmando que a sessão administrativa continuou válida.

O diretório legado `/home/data-protection-keys` não deve ser utilizado pela aplicação após a remoção de `Admin__DataProtectionPath`.
