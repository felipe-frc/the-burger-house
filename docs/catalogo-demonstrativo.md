# Catálogo demonstrativo local

O catálogo de portfólio contém 15 produtos aprovados, com preços persistidos no PostgreSQL e conteúdo editorial reaproveitado dos assets existentes. Os códigos estáveis começam com `demo-`. Os registros legados permanecem no banco como inativos para preservar os relacionamentos históricos.

O comando abaixo exige o Python com psycopg e as credenciais libpq privadas do banco `tbh_portfolio_dev`, com `PGHOST=127.0.0.1`. Use o ambiente local descrito no [guia do portfólio](postgresql-portfolio.md).

```powershell
python scripts/admin/seed-demo-catalog.py --apply
python -m unittest discover -s tests -p test_demo_catalog.py
```

O seed é explícito, transacional e idempotente. Sua reexecução reaplica os nomes, preços, categorias e estado ativo aprovados para a demonstração. Ele mantém os IDs, imagens enviadas, custos existentes e registros históricos. Outros produtos dessa instalação demonstrativa são desativados comercialmente. O launcher `portfolio-local.ps1 -Mode Init` executa esse procedimento após a importação sintética.

A vitrine consulta `GET /api/products`. O código persistido associa cada produto à sua apresentação existente. Preços e disponibilidade vêm da API. Produtos ausentes, inativos ou com preço inválido continuam bloqueados. O Owner mantém a administração pelos endpoints existentes.

O gateway do portfólio bloqueia checkout externo. Os testes de compra usam PostgreSQL real em schema isolado e o provedor PagBank controlado localmente. A variável `TBH_BROWSER_APPROVED_CATALOG=1`, junto a `TBH_BROWSER_WITH_CONTROLLED_PROVIDER=1`, habilita o cenário Chromium de cinco produtos das três categorias na suíte StorefrontFlowTests.
