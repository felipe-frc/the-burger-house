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

## Data Protection no Azure App Service

No Azure App Service, o ASP.NET Core utiliza o armazenamento persistente padrão de Data Protection em:

~~~text
/home/ASP.NET/DataProtection-Keys
~~~

O App Service não precisa da configuração `Admin__DataProtectionPath`.

A aplicação continua oferecendo suporte a `Admin:DataProtectionPath` para ambientes que precisem definir explicitamente outro local.

A persistência do key ring padrão foi validada em produção reiniciando o App Service e confirmando que a sessão administrativa continuou válida.

O diretório legado `/home/data-protection-keys` não deve ser utilizado pela aplicação após a remoção de `Admin__DataProtectionPath`.
