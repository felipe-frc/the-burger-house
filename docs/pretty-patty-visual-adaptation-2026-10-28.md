# The Burger House — adaptação visual da landing, 28/10/2026

Implementação local concluída na branch existente, sem commit ou publicação. Escopo de UI: `src/routes/index.tsx` (alterado), `src/components/landing/FeaturedBurgers.tsx` e `src/styles/landing.css` (novos). Verificador de navegador: `scripts/verify-landing-reconstruction.mjs`. Demais evidências em `test-results/landing-reconstruction/`.

## Referência e adaptação

A referência oficial [Pretty Patty](https://www.prettypatty.ch/) foi inspecionada em navegador real, desktop e mobile. A análise considera o estado observado, sem atribuir código, biblioteca ou duração de animação à referência.

| Elemento observado | Princípio | Adaptação própria implementada |
| --- | --- | --- |
| Hero desktop com fotografia dominante e composição central | Atenção concentrada no alimento, poucas ações | Composição triangular com as três fotografias existentes, campo amarelo e mascote da casa separado das fotos |
| Hero mobile recomposta | Mudar a composição em vez de comprimir o desktop | Fotos acima das ações, sem anotação lateral, título e botões reorganizados |
| Navegação compacta | Destinos e idioma fáceis de encontrar | Header e seletor PT/EN existentes preservados, ajuste visual restrito à landing |
| Produtos com item central e navegação lateral; troca pelo botão Next observada | Exploração de uma receita por vez | Abas dos três burgers, painel com ingredientes e preço real, anterior/próximo, teclado e anúncio acessível |
| Campos amplos de azul e creme | Alternância entre informação e impacto | Hero creme, faixa preta, destaques creme, institucional azul e careers creme |
| Fotografia institucional e texto expressivo | Apresentar ambiente e personalidade | Foto própria existente, título com line-height seguro, texto original preservado |
| Recrutamento e fechamento com ações diretas | Reduzir distrações no fim da página | Careers compacto, mailto original e footer com dados/privacidade preservados |

Não importamos fotos, marca, ilustrações, textos ou código do Pretty Patty. Não reproduzimos sua página integralmente: não adicionamos formulário, feed social, locais ou programas comerciais que não fazem parte do fluxo existente da Burger House.

## Composição e proporção

Ordem final: header → hero → faixa animada → apresentação navegável dos três burgers → institucional → careers → footer.

Bricolage Grotesque e Gabarito mantidas. H1 desktop entre 47,81 e 52 px nas resoluções exigidas; mobile 31,2 px. Em 1440 × 900, o H1 passou de cerca de 61,92 para 50,4 px; a página passou de cerca de 3.172 para 2.331 px em português. A hero termina em y=642,88 px, incluindo o header acima e a faixa. Nos demais desktops: y=700,31 em 1920 × 1080 e y=612,25 em 1366 × 768. Sem redução global via scale.

O azul foi aprofundado localmente para contraste de texto: #2859b2. Creme #fff7e3, vermelho #ff3816, amarelo #f7c94b e tinta #171717 mantêm a família cromática da identidade. Nenhum token global foi alterado.

Os destaques exibem os preços retornados pelo catálogo isolado: Crispy Cheddar R$ 35,90; Onion Crunch R$ 43,90; O Praiano R$ 43,90. A lógica de busca por código, disponibilidade e formatação existente foi preservada literalmente. Não usamos os preços estáticos de campanha como fonte comercial.

## Movimento e interação

- Entrada original e discreta das três fotografias, apenas com transformação e sem conteúdo inicialmente invisível.
- Transição curta de painel ao selecionar um burger; sem autoplay ou temporizador de troca.
- Hover de foto e botões; foco visível e alvos de pelo menos 44 px.
- Abas com setas, Home/End e foco móvel; anterior/próximo também disponíveis por toque.
- Pequeno deslocamento do recorte da foto institucional associado ao scroll via CSS view timeline, com fallback estático.
- Faixa animada existente preservada em modo normal. Movimento, transições e faixa ficam estáticos com prefers-reduced-motion.
- Nenhuma dependência adicionada.

## Validação

- 42 testes existentes do frontend: aprovados.
- TypeScript: aprovado.
- ESLint: zero erros; dez avisos preexistentes de Fast Refresh.
- Build local: aprovado; sem deploy.
- Navegador Chromium: 12 combinações aprovadas — PT/EN em 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024, 390 × 844 e 360 × 800.
- Todas as três seleções, teclado, links, imagens e ausência de overflow verificados; screenshots reais em cada combinação.
- Zero pageerrors e zero requisições mutantes nos testes visuais. Requisições que alterariam dados foram bloqueadas pelo verificador.
- Movimento normal e reduzido conferidos no navegador. Cinco pares principais de contraste aprovados: azul/creme 6,22:1, preto/vermelho 5,83:1, amarelo/azul 4,24:1 para títulos grandes.
- Ambiente confirmado como Homologation, isolated=true, sandbox=true; catálogo público com 15 produtos.
- Detector de design: sem ocorrências.
- Comparação de hashes de arquivos existentes: somente `src/routes/index.tsx` mudou nesta missão. Backend, administração, integração financeira, catálogo, preços, carrinho, checkout, componentes compartilhados, tokens globais e configurações preservados.
- Revisão visual independente: **ship**, sem achado material que exija correção nas seis capturas revisadas. Sem comp aprovado para comparação pixel a pixel.

## Evidências e limites

`visual-report.json`: medidas, idiomas, abas, teclado e links. `motion-and-content.json`: preços, imagens, movimento e contraste. `protected-review.json`: limite das alterações. `design-detector.json`: detector. `final-hosted-check.json`: resposta final da Home, menu e login sem autenticação ou escrita.

A inspeção não determina os detalhes internos nem todas as animações temporais da referência; os movimentos implementados são originais. O teste mobile usa viewports reais de Chromium, não certifica hardware físico. Não houve teste financeiro, criação de pedido, login administrativo ou acesso de escrita ao banco. O DESIGN.md preexistente descreve outra direção visual e permanece intacto; este trabalho não transforma esse documento desatualizado em autoridade para a landing atual.

## Abrir para avaliação

O mesmo gateway de homologação foi recarregado para servir o build local; API, banco e túnel existentes foram preservados. Endereço temporário:

https://adventure-threatened-preceding-asia.trycloudflare.com/

No PowerShell, para abrir a página sem reiniciar serviços:

```powershell
Start-Process 'https://adventure-threatened-preceding-asia.trycloudflare.com/'
```

Para repetir as verificações locais:

```powershell
npm test -- --maxWorkers=1
npm run typecheck
npm run lint
npm run build
node scripts/verify-landing-reconstruction.mjs
```

O build apenas gera arquivos locais. Para visualizar uma nova compilação no gateway já iniciado, é necessário recarregar somente esse processo local; não iniciar uma segunda instância na mesma porta. O endereço público depende dos processos locais e do túnel permanecerem ligados.
