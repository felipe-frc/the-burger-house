# Portfólio PostgreSQL — guia consolidado

O procedimento oficial foi consolidado em [Release 1.0](portfolio-release-1.0.md). Use um único endereço: `https://127.0.0.1:55485`, com `/menu` e `/admin/`, API 55484 e PostgreSQL 18.1 na porta **55482**.

```powershell
pwsh -NoProfile -File scripts/admin/portfolio-local.ps1
```

O launcher valida a credencial PagBank Sandbox na inicialização, preserva o banco principal e não aplica migrations. Sem credencial, a opção `-Offline` mantém catálogo e Owner reais com checkout explicitamente bloqueado. Consulte o guia consolidado para primeira instalação, senha Owner, credenciais próprias, retorno do checkout, testes isolados, segurança e limitações.

O antigo SQLite e seus pedidos permanecem preservados. As ferramentas `homologation.ps1`, fixtures e runners continuam disponíveis para ensaios técnicos isolados; não são uma segunda aplicação necessária ao uso diário. Não misture históricos nem copie pedidos automaticamente entre bancos.

O [procedimento de importação e operação](postgresql-operacao.md) permanece válido para migrações deliberadas e futuras instalações independentes. Nenhuma instrução de provisionamento autoriza modificar um banco existente, publicar ou contratar recursos.
