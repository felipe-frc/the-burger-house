# HTTPS local confiável

O endereço oficial é `https://127.0.0.1:55485`, com vitrine em `/menu` e Owner em `/admin/`. As portas não mudam.

## Certificado e confiança

O certificado antigo era autoassinado, emitido por `CN=localhost`, válido por sete dias. Seus SANs já incluíam `localhost` e `127.0.0.1`; o aviso vinha da ausência de confiança na cadeia, não de um erro nesses nomes.

O launcher executa `scripts/admin/local-https.ps1 -Mode Prepare`. O script usa `CertificateRequest` do .NET para preparar uma CA exclusiva de desenvolvimento e um certificado de servidor com SANs `localhost`, `127.0.0.1` e `::1`, uso Server Authentication e validade de 90 dias. Não instala confiança automaticamente. A CA é válida por três anos. A renovação do certificado de servidor reutiliza a CA existente; uma CA perto do vencimento exige revisão explícita.

Essa implementação nativa evita uma dependência adicional no Windows. `mkcert` também é uma opção válida para instalações que já o utilizem; não é necessário instalar uma segunda CA para usar o launcher deste projeto.

Os arquivos ficam em `.test-tmp/portfolio-dev/tls`, fora do Git. A chave da CA é protegida por Windows DPAPI. A pasta e a chave do servidor têm acesso restrito ao usuário atual e SYSTEM. Não copie esses arquivos para outro desenvolvedor, não os publique e não confunda a CA local com certificado de produção.

## Autorizar confiança na própria máquina

1. Prepare os arquivos, sem instalar a CA:

   ```powershell
   pwsh -NoProfile -File scripts/admin/local-https.ps1 -Mode Prepare
   ```

2. Confira `Root`, `RootThumbprint`, nomes e validade. A instalação da CA permite que os navegadores desse usuário confiem em certificados assinados por ela. A chave privada precisa permanecer protegida.
3. Somente após autorização do proprietário da máquina, execute o `TrustCommand` exibido. Ele exige a impressão digital da CA conferida e instala somente o certificado público em `Cert:\CurrentUser\Root`. Não altera `LocalMachine`.
4. Reinicie os navegadores e inicie o comando oficial:

   ```powershell
   pwsh -NoProfile -File scripts/admin/portfolio-local.ps1
   ```

5. Verifique a cadeia:

   ```powershell
   pwsh -NoProfile -File scripts/admin/local-https.ps1 -Mode Verify
   ```

   `SignatureChainValid` confirma a cadeia criptográfica com a CA preparada. `WindowsTrusted` precisa ser `true` para comprovar confiança no Windows. Validar somente a assinatura não substitui essa instalação.

Chrome, Edge e Brave usam a confiança local do sistema. O Firefox moderno também pode confiar nas raízes instaladas no Windows. Confira em Configurações → Privacidade e Segurança → Certificados a opção de confiar nas raízes instaladas pelo usuário. Políticas corporativas ou uma opção desativada podem impedir essa confiança. Não importe chaves privadas no navegador.

Não utilize exceções permanentes, HTTP, `ignoreHTTPSErrors`, `--ignore-certificate-errors` ou desativação de conteúdo misto como solução. Certificados não incluem portas em seus SANs: o nome precisa coincidir, enquanto o gateway permanece na porta 55485.

## Testes

`node tests/local-https-browser.mjs` usa perfis descartáveis de Chrome, Edge, Brave e Firefox. Verifica os dois nomes, a tela de login Owner e a sacola após encerramento/reabertura do navegador, com chamadas apenas GET à API principal. Mantém as verificações TLS ativas.

Os testes de escrita usam PostgreSQL descartável e provedor controlado. O runner `tests/owner-browser-sqlite.mjs` utiliza o certificado confiável local, ou `TBH_TEST_TLS_CERT`/`TBH_TEST_TLS_KEY` para um certificado confiável próprio. Não cria uma exceção de TLS para sua fixture. Em Node 24, `NODE_USE_SYSTEM_CA=1` permite que o cliente HTTP do runner use as raízes do sistema; isso acrescenta confiança explícita sem desativar a validação.

Este procedimento é local. Certificados públicos e configuração de hospedagem exigem uma implantação posteriormente autorizada.
