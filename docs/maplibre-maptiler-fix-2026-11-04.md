# MapLibre 6 + MapTiler Streets v4 — correção e evidências

04/11/2026. Projeto local: `frontend-ai-studio`. Nenhuma chave ou URL com valor de chave foi incluída neste relatório ou nos arquivos de evidência.

## Causa comprovada

O único valor de `VITE_MAPTILER_KEY` encontrado em `.env.local` era um caractere de controle. A requisição real da aplicação continha esse controle e recebeu **HTTP 403**. `encodeURIComponent` converte U+0016 para `%16`: a codificação da URL estava funcionando, mas o conteúdo da configuração estava incorreto.

A auditoria local não encontrou outra definição dessa variável em arquivos de modo nem na variável de processo do agente. A leitura é feita por `import.meta.env.VITE_MAPTILER_KEY`. O carregamento do Vite ocorre na inicialização, com precedência de variáveis de processo e arquivos específicos de modo conforme sua [documentação oficial](https://vite.dev/guide/env-and-mode).

Após o proprietário digitar a chave existente no terminal privado, o helper verificou Streets v4 com a origem `http://127.0.0.1:3001` e recebeu **HTTP 200**. Somente a atribuição de `VITE_MAPTILER_KEY` foi atualizada; o restante do conteúdo de `.env.local` foi comparado e preservado. O arquivo já estava ignorado pelo Git.

Foi realizado um teste antes das mudanças de implementação, alterando apenas essa configuração: estilo, tiles, sprites e glifos responderam 200, o mapa apareceu e não houve erro de console. Isso isola a configuração malformada como causa do 403 e do mapa sem dados naquela reprodução; não demonstra invalidez da chave que o proprietário havia testado manualmente.

## Diagnóstico do Worker

Versão instalada confirmada: **maplibre-gl 6.16.0**, ESM. O import existente corresponde à [integração oficial MapLibre 6/Vite](https://maplibre.org/maplibre-gl-js/docs/#esm): `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url`, seguido de `setWorkerUrl(workerUrl)`.

**Não foi alterado.** Na execução inicial, ainda com a configuração da chave incorreta, o Worker já retornava 200, MIME `text/javascript`, e o objeto de execução do MapLibre estava inicializado. O erro histórico “Worker failed to load” não foi reproduzido no estado atual dessa origem; não foi atribuída a ele uma causa especulativa.

| Ambiente | Caminho do Worker observado | HTTP/MIME | Execução |
| --- | --- | --- | --- |
| Vite dev, 127.0.0.1:3001 | `/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs` | 200, JavaScript | Module worker inicializado |
| Build servido localmente, 127.0.0.1:3004 | `/assets/maplibre-gl-worker-Br3j0JGE.js` | 200, JavaScript | Module worker inicializado |

Não havia header CSP no documento nas duas origens locais testadas. Não foi removida ou flexibilizada política de segurança; nenhuma configuração Vite foi modificada. O código instalado cria Worker do tipo `module`, compatível com a URL empacotada fornecida pelo Vite.

O `main.tsx` atual não envolve o App em Strict Mode. Em um teste adicional com o componente dentro de `React.StrictMode`, houve um canvas e um marcador após a montagem; ambos foram removidos após desmontar. ResizeObserver e listeners também possuem cleanup no efeito.

## Correções aplicadas

1. Variável local corrigida por entrada privada, sem copiar chave para código, chat, logs ou comandos.
2. Validação de configuração antes de construir o mapa: ausência, caracteres de controle e espaços internos recebem mensagens específicas e não são enviados como chave ao provedor.
3. Correção de compatibilidade de tipos: `antialias` diretamente em `MapOptions` era rejeitado pelo TypeScript. A opção passou para `canvasContextAttributes: { antialias: true }`, conforme o tipo efetivamente instalado. Isso corrige o erro de tipo, sem atribuir a esse campo a causa do 403.
4. Tratamento distinto para Worker, WebGL, CSP, HTTP 401/403, 404, 429, indisponibilidade de serviço e rede. Mensagens não incluem o erro bruto nem sua URL, que poderiam conter a chave.
5. Listener de erro registrado logo após construir o mapa; falhas não são apagadas indiscriminadamente pelo evento `load`. Listener de `load` removido no cleanup, além do listener de erro e do observador.

Foi mantido o estilo vetorial remoto Streets v4, centro `[-48.631664, -26.991683]`, zoom inicial 13,5, controles, atribuição, pin personalizado e conteúdo do popup. Nenhum fallback para raster/iframe, mock de aprovação ou substituição de provedor foi introduzido.

## Arquivos efetivamente alterados/criados

| Arquivo | Finalidade |
| --- | --- |
| `.env.local` | Atualização exclusivamente de `VITE_MAPTILER_KEY`, por entrada privada; ignorado pelo Git |
| `src/components/LocationMap.tsx` | Guardas, mensagens específicas, opção compatível com MapLibre 6 e cleanup |
| `src/utils/locationMap.ts` — novo | Validação pura da variável e classificação sanitizada de falhas |
| `src/utils/locationMap.test.ts` — novo | Regressões para controle U+0016, configuração e mensagens sem credenciais |
| `scripts/configure-maptiler-key-private.ps1` — novo | Entrada oculta, teste 200 e alteração somente da variável autorizada |
| Este relatório e `audit/maplibre-fix-2026-11-04/` | Evidências sanitizadas e verificadores |

`scope-verification.json` confirma preservação de `LocationsSection.tsx`, `LocationsSection.css`, `index.css`, Vite, dependências e assets, incluindo `public/assets/branding/tbh-location-pin.png`. A identidade, as dimensões, as cores, as fontes, os textos do painel, logo, mascote e ações não foram alterados.

## Resultado técnico

- TypeScript (`npm run lint`): aprovado após a correção.
- Dois testes de regressão (`node --import tsx --test src/utils/locationMap.test.ts`): aprovados.
- Build (`npm run build`): aprovado, emitindo o Worker empacotado. Permanecem avisos sobre `__dirname` na configuração e tamanho do bundle; não foram silenciados ou tratados fora do escopo.
- Um teste de HTTP 403 simulado exclusivamente no navegador confirmou a mensagem específica de chave/origens; não houve modificação do serviço remoto. Essa evidência é distinta dos testes positivos reais abaixo.
- Teste de ciclo de vida em Strict Mode aprovado.

## Resultado real do mapa

| Ambiente | Viewport | Streets v4 e recursos | Worker | Zoom/movimentação | Pin/popup/atribuição | Console |
| --- | --- | --- | --- | --- | --- | --- |
| Desenvolvimento | 1440 × 1000 | HTTP 200 | Inicializado | Aprovados | Aprovados | Sem erros relevantes |
| Desenvolvimento | 375 × 812, DPR 2 | HTTP 200 | Inicializado | Aprovados | Aprovados | Sem erros relevantes |
| Build local | 1440 × 1000 | HTTP 200 | Inicializado | Aprovados | Aprovados | Sem erros relevantes |
| Build local | 375 × 812, DPR 2 | HTTP 200 | Inicializado | Aprovados | Aprovados | Sem erros relevantes |

Confirmações por rede, DOM, execução do Worker e inspeção visual:

- Streets v4 em `/maps/streets-v4/style.json` respondeu 200.
- TileJSON, tiles Protobuf, sprites e glifos responderam 200; ruas, nomes e região de Balneário Camboriú ficaram visíveis.
- Um único canvas e pin por mapa. A imagem do marcador continua sendo `tbh-location-pin.png`, não o mascote.
- Popup com “Localização ilustrativa — projeto fictício”.
- Atribuição MapTiler e OpenStreetMap preservada.
- Zoom pelo controle alterou a renderização; arraste deslocou a posição do pin de forma mensurável. Sem overflow horizontal da página nos cenários testados.

O build foi apenas servido em loopback para inspeção, não publicado. Os testes usaram Chromium/WebGL por SwiftShader; não equivalem a homologação em todos os aparelhos físicos.

## Evidências e pendências

Pasta `audit/maplibre-fix-2026-11-04/`:

- `before.json`: 403 com configuração malformada e Worker já operacional.
- `key-configuration.json`: somente status 200, atualização local e preservação das demais variáveis.
- `after-key.json`: rede real após corrigir somente a variável, sem mudanças de implementação.
- `validation.json`: quatro cenários reais, recursos sanitizados, zoom, arraste e popup.
- `lifecycle-errors.json`: HTTP 403 simulado e teste Strict Mode.
- `scope-verification.json`: arquivos e preservação do pin/interface.
- `dev-1440-map.png`, `dev-375-map.png`, `build-1440-map.png`, `build-375-map.png` e respectivas capturas de popup.

**Nenhuma pendência bloqueante para o mapa local validado em `http://127.0.0.1:3001/`.** A ocorrência anterior em `http://localhost:3000` é de outra origem/porta e não deve ser confundida com o servidor validado. Não foi alterada a allowlist remota. MapTiler documenta que [localhost e 127.0.0.1 são origens distintas](https://docs.maptiler.com/guides/developer/credentials/api-key/#local-testing); outros domínios devem ser configurados e validados em etapa própria antes da publicação.

Endereço e telefone fictícios continuam preservados. Não houve backend, PagBank, API de pedidos, produção, dependência nova, backup automático, commit, push ou deploy.
