# Proteção do login administrativo

Somente o POST `/api/admin/auth/login` usa a policy `OwnerLogin`. Cada IP remoto
processado pelo middleware confiável recebe 10 tentativas por janela fixa de um
minuto, sem fila. A 11ª recebe HTTP 429. Todas as tentativas contam, inclusive
sucessos e requisições posteriormente rejeitadas por CSRF. IPv4 e IPv4 mapeado
em IPv6 compartilham a mesma chave. Peer ausente usa um bucket conservador
`unknown-peer`; conexões HTTP reais devem sempre fornecer o IP do transporte.

A proteção adicional usa IP + e-mail (`Trim().ToUpperInvariant()`). A chave em
memória é HMAC-SHA-256 com segredo aleatório por processo, nunca persistido;
e-mail, senha, cookies e tokens não são guardados no estado do cooldown nem
registrados em logs. Não existe bloqueio global da conta.

## Cooldown

| Falha consecutiva efetivamente autenticada | Cooldown após a falha |
| --- | --- |
| 1–4 | Nenhum |
| 5 | 2 segundos |
| 6 | 4 segundos |
| 7 | 8 segundos |
| 8 | 16 segundos |
| 9 | 32 segundos |
| 10 e seguintes | 60 segundos |

Tentativas durante o cooldown não consultam a identidade, não aumentam o contador
e não prolongam o prazo. Sucesso limpa somente a combinação correspondente.
Após 30 minutos sem falha efetivamente autenticada, a sequência recomeça.
As tentativas concorrentes da mesma combinação são serializadas. Conta inexistente,
senha incorreta e cooldown recebem o mesmo HTTP 401 e corpo
`{"error":"Credenciais inválidas."}`, sem `Retry-After` ou indicação de existência.
O hashing real/dummy de contas conhecidas/desconhecidas permanece inalterado.

O cache dedicado limita-se a 10.000 combinações, com expiração por inatividade e
compactação sob pressão. Evicção/reinício pode reiniciar um cooldown, mas não
remove o limiter independente por IP. Ambos os controles são locais ao processo:
em múltiplas instâncias, cada réplica tem sua cota/estado. Para limites globais
entre réplicas, é necessário armazenamento distribuído ou controle no gateway;
isso não foi introduzido nesta alteração. Clientes atrás do mesmo NAT compartilham
a cota de IP.

## Proxy confiável e Azure App Service

O ramo `/api/admin` executa Forwarded Headers antes de redirecionamento HTTPS,
autenticação e rate limiting. Apenas `X-Forwarded-For` e `X-Forwarded-Proto` são
habilitados; Host não é encaminhado. O padrão permite um hop e conserva somente
as origens loopback do ASP.NET Core (`127.0.0.0/8` e `::1`). Um cliente remoto não
confiável não muda sua identidade enviando `X-Forwarded-For`.

As opções são aplicadas em `PostConfigure`, inclusive sobre defaults de forwarding
automático do host. As listas nunca ficam ambas vazias. CIDR `/0`, IP não especificado,
valores inválidos e limites de hops fora de 1–5 são rejeitados. A confiança adicional
deve corresponder somente à infraestrutura de proxy sob controle da hospedagem.

Antes do deploy, confira a topologia real do App Service (Windows/IIS ou Linux,
ARR e eventuais proxies adicionais). Se o peer imediato não for loopback, configure
as variáveis da API no Azure, usando os endereços/rede reais dessa infraestrutura:

- `Admin__ForwardedHeaders__KnownProxies__0`: IP do proxy confiável; índices seguintes
  para outros proxies necessários.
- `Admin__ForwardedHeaders__KnownNetworks__0`: CIDR restrito e controlado, quando a
  infraestrutura exigir rede em vez de IP estável.
- `Admin__ForwardedHeaders__ForwardLimit`: quantidade de hops confiáveis a processar,
  padrão `1`, máximo `5`. Cada intermediário processado precisa ser confiável.

Não há IP universal de Azure codificado aqui. Obtenha os valores da configuração
de rede da implantação; não copie IPs de clientes ou de cabeçalhos arbitrários.
O proxy de borda deve remover/sobrescrever os cabeçalhos recebidos do cliente ou
acrescentar corretamente o peer real. Sem configurar um proxy não-loopback, o
limiter verá o IP desse proxy e seus clientes compartilharão uma cota.

Não use `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` como atalho para confiar em toda
a Internet. Prefira removê-lo/desabilitá-lo e usar a configuração explícita acima.
Se o host já habilitar middleware automático (por exemplo integração IIS), ele usa
as mesmas opções restritas. Não altere a confiança sem revisar a topologia existente.
Nenhuma configuração Azure foi alterada por esta tarefa.

Fontes oficiais:
[Forwarded Headers e proxies](https://learn.microsoft.com/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-9.0)
e [rejeição de proxies desconhecidos](https://learn.microsoft.com/dotnet/core/compatibility/aspnet-core/8.0/forwarded-headers-unknown-proxies).
