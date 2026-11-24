# The Burger House 2.0

O frontend oficial está em `frontend`. Os comandos de desenvolvimento, build e CI selecionam essa aplicação.

| Diretório | Responsabilidade |
|---|---|
| `frontend/src` | React, seções, animações, catálogo visual e apresentação do checkout |
| `frontend/public` | Assets publicados e política estática |
| `shared/storefront` | Implementação única dos contratos, API client, catálogo reconciliado, validações e sessão do checkout |
| `src` | Testes de contrato, suporte aos testes da raiz e caminhos usados por scripts operacionais |
| `backend` | API e regras .NET existentes |
| `owner-ui` | Aplicação administrativa React e Liquid Glass, publicada em `/admin/` |
| `scripts/admin` | Ferramentas operacionais, de manutenção e de homologação |
| `scripts/utils.js`, `scripts/config.js` | Utilitários operacionais compartilhados, com comportamento existente |
| `tests`, testes junto aos módulos | Testes de contratos, administração e UI |

O checkout React importa `shared/storefront` diretamente. Os arquivos correspondentes em `src` reexportam a implementação para preservar consumidores e testes existentes. As regras financeiras, payloads, chaves de storage e critérios de catálogo mantêm seu comportamento anterior. Os tipos de carrinho foram extraídos para um módulo sem contexto React.

O mapa é um chunk carregado quando a seção se aproxima da viewport. O wrapper conserva a altura da composição. O vídeo do mascote recebe sua fonte quando está visível e a preferência permite movimento. Os wrappers de GSAP e o primeiro frame apresentado continuam controlando a aparência.

`npm run build` gera `frontend/dist`. `npm run build:owner` gera `owner-ui/dist`. `npm run build:vercel` reúne os dois builds no Build Output API e exige `BURGER_BUILD_API_ORIGIN`. O diretório de saída deve estar vazio. `BURGER_BUILD_OUTPUT_DIR` permite validar em uma pasta local nova.

`npm run test:owner:e2e` e `npm run test:integration` constroem um pacote temporário, usam o Chrome instalado e encerram os servidores de loopback ao final. Esses testes usam fixtures de API. `npm run test:owner:browser-sqlite` requer os projetos .NET restaurados e executa o Owner no Chrome com a API ASP.NET Core e um SQLite novo para cada cenário, em portas escolhidas pelo sistema. O gateway do teste bloqueia checkout e pagamentos. A suíte .NET também verifica contratos e persistência em SQLite descartável.

A entrada React e a configuração Vite ficam em `frontend/`. A configuração de build Lovable e sua árvore de apresentação saíram da raiz. O CI usa os comandos da aplicação oficial. A reprodução por clone depende do versionamento dos arquivos locais em uma etapa autorizada.
