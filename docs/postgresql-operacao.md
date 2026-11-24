# Instalação individual e transferência para PostgreSQL

## Preparação por estabelecimento

Registre o proprietário dos recursos, região, volume de pedidos, horário de corte e orçamento. Cada loja recebe seu próprio banco, roles, API, origens web, catálogo, administradores, conta PagBank, chave de criptografia e armazenamento de arquivos. Em uma migração, conserve a chave que já protege os registros daquela instalação. Confirme a leitura de um pedido com dados protegidos por meio da API, em sessão privada. Uma instalação nova inicia com catálogo vazio e exige cadastro dos produtos.

No Azure, use Flexible Server na mesma região do App Service. Confirme disponibilidade de versão, SKU, limites de conexões e capacidade antes da compra. O ensaio usou PostgreSQL 18.1. Repita o ensaio na versão exata do servidor contratado. Prefira integração de rede privada com DNS resolvível pelo App Service. Em alternativa, restrinja a origem às saídas autorizadas e mantenha TLS com verificação de hostname. Separe a role proprietária do esquema, usada na implantação, da role da API com DML nas tabelas, leitura do histórico EF e uso das sequences. Revogue CREATE público no schema escolhido. Valide INSERT e leitura pela role de execução antes do corte.

Configure no App Service, por referência ao cofre, `ConnectionStrings__DefaultConnection` com Host DNS, Database, Username, Password e `SSL Mode=VerifyFull`. Inclua o certificado raiz quando a cadeia não estiver no trust store. Restrinja o pool pelo limite do servidor dividido entre instâncias e workers, reservando capacidade para administração e migrations. Defina explicitamente `Maximum Pool Size`, `Timeout` e `Command Timeout` após teste de carga. O driver mantém pooling padrão. O aplicativo deixa o reprocessamento financeiro sob controle da idempotência e da conciliação. A autenticação Entra por identidade gerenciada exige role mapeada e renovação do token no pool. O caminho implementado e exercitado usa credencial PostgreSQL.

Configure `Privacy__EncryptionKey`, key ring de Data Protection persistente e compartilhado entre as réplicas da mesma instalação, diretório persistente de imagens e origens HTTPS em `Cors__AllowedOrigins`. Restrinja acesso aos arquivos e segredos à identidade do serviço. Confira `PagBank__BaseUrl`, token, retorno e notificação contra a documentação do ambiente contratado. No sandbox, use credenciais e URLs de sandbox. Use o mesmo domínio da loja para os proxies do browser. Cookies Owner, CSRF e o endpoint público de webhook devem atravessar o proxy com seus cabeçalhos. Cadastre o primeiro Owner de uma instalação vazia com `--create-owner` em terminal privado.

## Criar e reconciliar

1. Ensaiar primeiro com fonte sintética. Para produção, obter autorização específica para ponto de recuperação, leitura de dados pessoais, canal de transferência e tratamento do WAL. Planejar retenção e eliminação autorizada das mídias privadas. Suspender novas compras e mutações administrativas, drenar requisições, pausar workers e controlar novas notificações do provedor antes de fixar a origem. Registrar o instante e o último evento conciliado. Confirmar retentativa ou retenção durável dos webhooks antes da pausa.
2. Preparar banco vazio. No diretório `backend`, usando a conexão da role de migration e a chave privada da instalação, gerar SQL para revisão e aplicar as migrations com o contexto explícito.

   ```powershell
   dotnet tool run dotnet-ef migrations script --context PostgresContext --project BurgerHouse.Infrastructure --startup-project BurgerHouse.Api
   dotnet tool run dotnet-ef database update --context PostgresContext --project BurgerHouse.Infrastructure --startup-project BurgerHouse.Api
   ```

3. Instalar `psycopg[binary]==3.3.2` em ambiente Python isolado. Configurar libpq via ambiente privado ou serviço de credenciais. Fixar `PGHOST`, `PGDATABASE`, `PGUSER`, `PGSSLMODE=verify-full` e a CA para o Flexible Server. Usar `PGOPTIONS` com search_path explícito quando diferente de public. A partir da raiz do projeto, executar com caminhos e nomes da instalação.

   ```text
   python scripts/admin/import-sqlite-postgres.py CAMINHO_SQLITE --database NOME_CONFIRMADO --schema public --sqlite-utc
   ```

   Confirmar previamente que datas sem offset da origem estão em UTC. A ferramenta recusa frações que perderiam precisão. A opção separada `--truncate-ticks` aceita a perda dos dígitos inferiores a um microssegundo e informa a contagem. Em produção, essa decisão exige aprovação e avaliação de concorrência e ordenação. O importador usa snapshot SQLite somente leitura, bloqueio das tabelas de destino e uma transação PostgreSQL. Rejeita histórico incompatível, destino ocupado, campos sem correspondência, violação de FK, valores inexatos e divergências na releitura. Compara todas as linhas tipadas, inclusive IDs, referências históricas, estados e valores criptografados. Verifica somas de colunas monetárias e reposiciona sequences respeitando inclusive o maior ID histórico do SQLite. Mantém ausentes os valores históricos de categoria que a origem desconhece.
4. Arquivar o relatório agregado em armazenamento autorizado. Comparar também pedidos por canal e situação, pagamentos por método e situação, totais de estornos, receita líquida e datas de aprovação nos endpoints do Owner. Conferir imagens pela URL e pelo conteúdo. A transferência SQL preserva a referência e exige transporte separado e autorizado dos próprios arquivos. Confirmar leitura de dados cifrados com a chave original. Investigar divergências antes de qualquer troca de tráfego.

## Publicação e reversão

1. Obter autorização distinta para o ponto de recuperação restaurável, configuração remota, deploy da API, deploy web e testes externos. Para escalar além de uma instância, ensaiar concorrência dos workers, idempotência financeira, visibilidade do key ring e limitação de tentativas de login entre instâncias. Medir p95, utilização do pool, deadlocks, créditos de CPU, espaço e duração da janela.
2. Publicar a API compatível após o banco estar reconciliado. A inicialização confere o histórico e o catálogo PostgreSQL. Configurar o health check do App Service em `/health/ready`. Verificar resposta 204, catálogo, login, CSRF, notificações, pedidos, clientes, estoque, equipe, agenda e conciliação. Validar receita por categoria com sessão Owner, incluindo períodos sem vendas.
3. Construir `npm run build:vercel` com `BURGER_BUILD_API_ORIGIN` HTTPS e diretório de saída vazio, seguido de `npm run verify:build`. O pacote local reúne vitrine e Owner sob `/admin`. Confirmar a vinculação de cada domínio, projeto e ambiente no painel Vercel antes de publicar. O bundle web recebe a origem pública e nenhum acesso direto ao banco.
4. Ensaiar Pix, crédito, recusa, assinatura, repetição de webhook e conciliação no sandbox oficial. Homologar a conta comercial e liberar novas escritas em um único destino com aprovação do responsável. Monitorar filas de pagamento, eventos recebidos, pedidos aprovados, diferenças financeiras e erros do Owner.
5. Em falha antes da primeira escrita no destino, isolar o candidato e restaurar o tráfego para a versão anterior com a origem preservada. Após qualquer escrita nova, suspender operações novamente, identificar o delta por IDs e referências externas, consultar o provedor para eventos ocorridos na janela e reconciliar pedidos, estornos e transições. Preferir corrigir para frente. Uma reversão para SQLite só pode ocorrer após ensaio de reaplicação do delta, conferência financeira e aprovação explícita.

## Portfólio e operação comercial

Manter o repositório comercial privado e preparar uma apresentação pública separada com documentação e mídias sanitizadas e direitos de uso confirmados. Revisar também o histórico Git, arquivos preparados, diretórios locais Vercel, certificados, logs, artefatos e imagens. A licença comercial e a permissão de redistribuir ativos devem ser definidas pelo titular. Homologar a recuperação por estabelecimento, com RPO/RTO acordados e restauração autorizada em destino separado.
