# Retorno local do checkout

`PagBank:RedirectUrl` usa a configuração normal do ASP.NET Core: appsettings,
appsettings do ambiente, User Secrets em Development e variáveis de ambiente
(estas prevalecem). A variável `PagBank__RedirectUrl` pode ser definida apenas no
processo de desenvolvimento, sem alterar a configuração de produção.

A produção permanece com `https://burger-shop-aiib.vercel.app/`.
O serviço atual exige HTTPS público e rejeita loopback **também em Development**.
Portanto `http://localhost:5173/` é bloqueado pela aplicação antes do POST ao
PagBank; não foi comprovada nesta etapa uma rejeição remota desse endereço.
Nenhuma validação do backend foi relaxada.

Para teste manual local, pode ser utilizado um túnel HTTPS para o frontend e
`PagBank:RedirectUrl` pode ser configurado temporariamente com essa origem pública
exata por meio de User Secrets ou variável de ambiente em Development.

A API precisa ser reiniciada após a alteração para carregar a nova configuração.
Essa mudança não altera o redirect de checkouts que já tenham sido criados.

Abra o site **pela mesma origem HTTPS do túnel antes de iniciar o pedido** e
retorne na mesma aba. `sessionStorage` pertence à origem e à aba: iniciar em
localhost e retornar para Vercel ou para outra origem não recupera o contexto
local. Parâmetros da URL não substituem esse contexto e não aprovam pagamentos.

Para que um frontend publicado por túnel use uma API local também exposta
publicamente, configure `VITE_API_BASE_URL` com a URL HTTPS pública da API e
reinicie o Vite.

Na configuração local da API, inclua somente a origem necessária em
`Cors__AllowedOrigins__N`, utilizando um índice livre e preservando as origens
existentes.

No Vite, autorize apenas o hostname exato utilizado no teste, sem liberar hosts
globalmente. Qualquer alteração temporária dessa natureza deve ser revertida
depois do teste.

Sem `VITE_API_BASE_URL`, um hostname público utiliza a API de produção conforme
a configuração atual do frontend.

Não grave URLs temporárias, credenciais, tokens ou configurações particulares de
túnel no repositório. Não publique essas variáveis no ambiente de produção.

Durante o desenvolvimento deste fluxo, um túnel temporário do Cloudflare foi
utilizado apenas para tentar validar o retorno local. Essa configuração era
temporária e não faz parte da configuração versionada ou de produção.

O PagBank define `redirect_url` como o destino para o qual o cliente retorna após
o pagamento:
[referência oficial de Checkout](https://developer.pagbank.com.br/reference/objeto-checkout).

No retorno, a aplicação consulta o backend antes de exibir a aprovação. Após um
pagamento aprovado, os dados do pedido permanecem disponíveis até que o cliente
execute explicitamente a ação **Fazer novo pedido**.
