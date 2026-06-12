# 🍔 The Burger House

[![CI (Front-end)](https://github.com/felipe-frc/the-burger-house/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/felipe-frc/the-burger-house/actions)
[![Deploy Vercel](https://img.shields.io/badge/deploy-Vercel-black?logo=vercel)](https://burger-shop-aiib.vercel.app/)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwindcss&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-4.1-6E9F18?logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

Aplicação web de cardápio digital para hamburgueria desenvolvida com **HTML5**, **JavaScript Vanilla** e **Tailwind CSS**, com foco em manipulação de DOM, gerenciamento de estado, integração com APIs externas, testes automatizados, acessibilidade e experiência do usuário.

O projeto permite ao cliente explorar o cardápio por categorias, montar seu pedido com controle de quantidade, escolher entre entrega ou retirada no local, preencher o endereço com busca automática por CEP e finalizar o pedido diretamente pelo WhatsApp — tudo em um fluxo estruturado em etapas, com persistência do carrinho e feedback visual em tempo real.

---

## 🌐 Acesse o Projeto

🔗 **Deploy:** [The Burger House na Vercel](https://burger-shop-aiib.vercel.app/)

📁 **Repositório:** [The Burger House no GitHub](https://github.com/felipe-frc/the-burger-house)

A aplicação está publicada na **Vercel** com CI/CD automatizado via **GitHub Actions**.

---

## 📌 Objetivo do Projeto

Este projeto foi desenvolvido com o objetivo de praticar e demonstrar conhecimentos em:

- Construção de interfaces modernas e responsivas com HTML5 e Tailwind CSS;
- Manipulação do DOM com JavaScript puro;
- Renderização dinâmica de componentes via JavaScript;
- Gerenciamento de estado do carrinho sem frameworks;
- Separação entre regra de negócio e manipulação da interface;
- Modularização de código JavaScript por responsabilidade;
- Persistência de dados com localStorage;
- Integração com API externa (ViaCEP) para preenchimento de endereço;
- Validações de formulário no front-end;
- Feedback visual com animações, toasts e animações de scroll;
- Acessibilidade com focus trap, aria-live, aria-modal e navegação por teclado;
- Internacionalização inicial da interface em Português e Inglês;
- Testes automatizados com Vitest;
- Geração de cobertura de testes com Vitest Coverage V8;
- Testes E2E com Playwright simulando fluxos reais de compra;
- Integração contínua e deploy automatizado com GitHub Actions;
- Documentação técnica para portfólio profissional.

---

## 🚀 Funcionalidades

### 📋 Cardápio

- Exibição do cardápio separado por categorias: Hambúrgueres, Acompanhamentos e Bebidas;
- Renderização dinâmica dos produtos via JavaScript;
- Dados do cardápio centralizados em módulo próprio;
- Tradução dos principais textos do cardápio com suporte inicial a Português e Inglês;
- Tags de destaque por produto (Mais Pedido, Premium, Exclusivo, Destaque);
- Animação de entrada dos cards ao rolar a página.

### 🛒 Carrinho

- Adição e remoção de produtos no carrinho;
- Controle de quantidade de itens por produto;
- Regras do carrinho separadas em módulo próprio (`cart-service.js`);
- Cálculo automático de subtotal, taxa de entrega e total final;
- Remoção automática da taxa de entrega quando o cliente escolhe retirada no local;
- Persistência do carrinho com localStorage;
- Validação de carrinho vazio antes de prosseguir;
- Feedback visual com toast de confirmação ao adicionar itens;
- Indicador visual de itens adicionados ao carrinho;
- Testes automatizados cobrindo as principais regras do carrinho.

### 📍 Endereço de Entrega

- Etapa de preenchimento de endereço integrada ao fluxo do pedido;
- Busca automática de endereço via CEP utilizando a API ViaCEP;
- Validação do campo de número da casa (somente dígitos);
- Tratamento de CEP inválido ou falha de rede com mensagem de erro clara;
- Feedback visual e textual nos campos preenchidos automaticamente via CEP;
- Campos com indicação de preenchimento assistido (Rua, Bairro, Cidade).

### 📦 Revisão e Finalização

- Revisão completa do pedido antes de finalizar;
- Exibição de itens, quantidades, subtotal, taxa de entrega e total final;
- Campo opcional de observações do pedido;
- Envio do pedido formatado diretamente para o WhatsApp;
- Limpeza automática do carrinho e do localStorage após finalização.

### 🌎 Internacionalização

- Suporte inicial para Português e Inglês;
- Seletor de idioma na interface;
- Persistência da preferência de idioma no localStorage;
- Tradução dos principais textos estáticos;
- Tradução dos dados do cardápio renderizado dinamicamente;
- Teste automatizado para a camada de internacionalização.

### 🧪 Testes e Qualidade

- Testes unitários com Vitest;
- Testes de consistência dos dados do cardápio;
- Testes da camada de internacionalização;
- Testes das funções utilitárias;
- Testes das regras de negócio do carrinho;
- Cobertura local com Vitest Coverage V8;
- Testes E2E com Playwright;
- Validação automatizada do fluxo completo de compra com entrega;
- Validação automatizada do fluxo de retirada no local.

### ⚙️ Experiência e Interface

- Status dinâmico da loja (Aberto / Fechado) baseado no horário real;
- Interface responsiva para dispositivos móveis e desktop;
- Modais com focus trap para navegação por teclado;
- Fechamento dos modais pela tecla `Esc` e pelo clique no overlay;
- Acessibilidade com `aria-live`, `aria-modal`, `aria-describedby` e textos alternativos descritivos;
- Meta tags de SEO e Open Graph para melhor compartilhamento em redes sociais.

---

## 🛠️ Tecnologias

| Camada                  | Tecnologia                       |
| ----------------------- | -------------------------------- |
| Linguagem               | HTML5 / CSS3 / JavaScript (ES6+) |
| Estilização             | Tailwind CSS                     |
| Servidor local para E2E | Vite                             |
| Notificações            | Toastify JS                      |
| Ícones                  | Font Awesome 6                   |
| Tipografia              | Google Fonts (Inter + Poppins)   |
| API de Endereço         | ViaCEP                           |
| Persistência            | localStorage                     |
| Testes unitários        | Vitest                           |
| Cobertura de testes     | Vitest Coverage V8               |
| Testes E2E              | Playwright                       |
| Deploy                  | Vercel                           |
| CI/CD                   | GitHub Actions                   |
| Versionamento           | Git / GitHub                     |

---

## 🏗️ Estrutura do Projeto

```txt
the-burger-house/
│
├── .github/
│   └── workflows/
│       └── frontend-ci.yml        # Pipeline de CI com testes, build e E2E
│
├── assets/                        # Imagens e recursos visuais da aplicação
│   ├── logo-burger.webp
│   ├── bg.png
│   ├── icon.ico
│   └── ...
│
├── docs/
│   └── images/                    # Imagens utilizadas na documentação
│       ├── cardapio.png
|       ├── home.png
│       ├── cart.png
│       ├── pedido.png
│       ├── endereco.png
│       └── revisao.png
│
├── scripts/                       # Módulos JavaScript da aplicação
│   ├── address.js                 # Integração com ViaCEP e validações de endereço
│   ├── cart.js                    # Eventos, renderização e integração do carrinho com a interface
│   ├── cart-service.js            # Regras de negócio, cálculos e manipulação dos dados do carrinho
│   ├── config.js                  # Configurações gerais da aplicação
│   ├── data.js                    # Dados do cardápio, categorias, preços, imagens e traduções
│   ├── i18n.js                    # Internacionalização e troca de idioma
│   ├── main.js                    # Inicialização da aplicação e eventos principais
│   ├── order.js                   # Revisão e finalização do pedido via WhatsApp
│   ├── state.js                   # Estado compartilhado da aplicação e persistência no localStorage
│   ├── ui.js                      # Controle de interface, modais, animações e status da loja
│   └── utils.js                   # Funções utilitárias reutilizáveis
│
├── styles/
│   └── style.css                  # Estilos customizados e componentes visuais
│
├── tests/                         # Testes automatizados
│   ├── cart-service.test.js       # Testes das regras de negócio do carrinho
│   ├── data.test.js               # Testes de consistência dos dados do cardápio
│   ├── i18n.test.js               # Testes da camada de internacionalização
│   ├── utils.test.js              # Testes de funções utilitárias
│   └── e2e/
│       └── checkout.e2e.js        # Testes E2E do fluxo de compra com Playwright
│
├── .gitignore                     # Arquivos e pastas ignorados pelo Git
├── index.html                     # Estrutura principal da aplicação
├── output.css                     # CSS gerado pelo Tailwind em dev/build local (ignorado no Git)
├── package.json                   # Scripts, metadados e dependências do projeto
├── package-lock.json              # Versões travadas das dependências
├── playwright.config.js           # Configuração dos testes E2E com Playwright
├── tailwind.config.js             # Configuração do Tailwind CSS
├── vercel.json                    # Configuração de deploy na Vercel
├── LICENSE                        # Licença MIT
└── README.md                      # Documentação do projeto
```

---

## 📸 Interface do Sistema

### 🏠 Página Inicial

Tela inicial com hero section, logo, endereço, horário de funcionamento e status dinâmico da loja.

![Home](/docs/images/home.png)

---

### 🍔 Cardápio

Cardápio dividido por categorias, com imagens, descrições, tags de destaque e botão de adição ao carrinho.

![Cardápio](/docs/images/cardapio.png)

---

### 🛒 Carrinho

Modal de carrinho com listagem de itens, controle de quantidade, subtotal, taxa de entrega e ações de navegação.

![Carrinho](/docs/images/cart.png)

---

### 🚚 Tipo de Pedido

Etapa para escolha entre **Entrega** ou **Retirada no local**, permitindo que o cliente defina como deseja receber o pedido antes de prosseguir para endereço ou revisão.

![Tipo de Pedido](/docs/images/pedido.png)

---

### 📍 Endereço de Entrega

Formulário de endereço com busca automática por CEP, validações e indicação de campos preenchidos automaticamente.

![Endereço](/docs/images/endereco.png)

---

### 📦 Revisão do Pedido

Tela de revisão com itens, endereço, subtotal, taxa de entrega, total final e botão de finalização via WhatsApp.

![Revisão](/docs/images/revisao.png)

---

## ▶️ Como Executar o Projeto

### Pré-requisitos

- Node.js instalado;
- npm instalado;
- Git instalado.

---

### 1. Clone o repositório

```bash
git clone https://github.com/felipe-frc/the-burger-house.git
cd the-burger-house
```

---

### 2. Instale as dependências

```bash
npm install
```

Ou, para instalar exatamente as versões registradas no `package-lock.json`:

```bash
npm ci
```

---

### 3. Execute o projeto em desenvolvimento

```bash
npm run dev
```

O Tailwind CSS ficará em modo watch, recompilando o `output.css` automaticamente a cada alteração.

---

### 4. Acesse no navegador

Com o `npm run dev` rodando em um terminal, abra o `index.html` no navegador ou utilize a extensão **Live Server** do VS Code para servir a aplicação localmente.

Se preferir não deixar o watch ativo, gere o CSS antes com:

```bash
npm run build
```

Depois disso, o `index.html` já encontrará o `output.css` gerado localmente.

---

### 5. Execute os testes unitários

```bash
npm test
```

---

### 6. Gere a cobertura dos testes

```bash
npm test -- --coverage
```

O relatório de cobertura é gerado localmente na pasta `coverage/`, que fica ignorada pelo Git.

---

### 7. Execute os testes E2E

```bash
npm run e2e
```

O Playwright sobe a aplicação localmente com Vite, executa os fluxos automatizados e valida o comportamento da aplicação no navegador.

---

### 8. Execute os testes E2E com navegador visível

```bash
npm run e2e:headed
```

---

### 9. Abra a interface visual do Playwright

```bash
npm run e2e:ui
```

---

### 10. Gere o build de produção

```bash
npm run build
```

O comando gera o arquivo `output.css` a partir de `styles/style.css`. Esse arquivo é um artefato local de build e fica **ignorado no Git**.

---

## ✅ Qualidade e CI/CD

O projeto possui uma pipeline de **GitHub Actions** configurada para garantir a integridade do repositório a cada alteração enviada para a branch `main`.

O workflow valida:

- Instalação das dependências com `npm ci`;
- Instalação do navegador Chromium usado pelo Playwright;
- Execução dos testes unitários com Vitest;
- Geração do CSS do Tailwind com `npm run build`;
- Execução dos testes E2E com Playwright;
- Presença dos arquivos obrigatórios do projeto;
- Presença dos módulos JavaScript principais;
- Presença dos arquivos de teste unitário e E2E;
- Estrutura dos módulos JavaScript na pasta `scripts/`.

Além disso, o projeto possui geração local de cobertura de testes com **Vitest Coverage V8**, permitindo acompanhar quais módulos estão protegidos por testes e identificar pontos de melhoria para novas refatorações.

Essa configuração reduz o risco de regressões, evita inconsistências estruturais e aumenta a confiabilidade do projeto para manutenção futura.

### Fluxo do `output.css`

O projeto **não versiona** o `output.css`.

- Em desenvolvimento, `npm run dev` gera e atualiza o arquivo automaticamente.
- Em build e CI, `npm run build` gera o arquivo antes das validações e dos testes E2E.
- A fonte de verdade dos estilos é `styles/style.css`; `output.css` é apenas o artefato compilado consumido pelo `index.html`.

---

## 🧠 Decisões de Desenvolvimento

### Renderização dinâmica do cardápio

Os dados dos produtos são centralizados no módulo `data.js`, facilitando a manutenção do cardápio, categorias, preços, imagens e traduções. Essa abordagem elimina duplicações no HTML, permite renderização dinâmica via JavaScript e aproxima o projeto de uma arquitetura mais organizada e orientada a componentes.

### Modularização do JavaScript

A lógica da aplicação foi separada em módulos por responsabilidade: dados, carrinho, regras do carrinho, endereço, pedido, interface, estado, internacionalização e funções utilitárias. Essa organização melhora a legibilidade, facilita testes e demonstra separação de responsabilidades em projetos front-end sem frameworks.

### Separação da regra de negócio do carrinho

As principais regras do carrinho foram extraídas para o módulo `cart-service.js`, separando cálculos e manipulação de dados da camada de interface. Com isso, funções como adicionar produto, remover produto, aumentar ou diminuir quantidade, calcular subtotal, calcular taxa de entrega e calcular total final passaram a ser mais fáceis de testar e manter.

Essa decisão reduz o acoplamento entre DOM e regra de negócio, melhora a clareza do `cart.js` e torna o projeto mais preparado para futuras evoluções, como integração com backend, novos tipos de desconto, cálculo de frete por região ou histórico de pedidos.

### Estado compartilhado e persistência

O estado do carrinho e do tipo de pedido é centralizado em `state.js`, com persistência no localStorage. Essa separação evita espalhar acesso direto ao armazenamento por toda a aplicação e facilita futuras alterações na estratégia de persistência.

### Integração com ViaCEP

A API ViaCEP automatiza o preenchimento dos campos de endereço a partir do CEP informado. O formulário inclui tratamento de CEP inválido, falhas de rede e mensagens de erro claras, com limpeza dos campos ao detectar inconsistências.

### Acessibilidade com focus trap

Os modais implementam focus trap básico, movendo o foco automaticamente ao abrir e mantendo a navegação por teclado dentro do modal. O fechamento por `Esc` e pelo clique no overlay também está disponível, seguindo os padrões de acessibilidade esperados em fluxos modais.

### Internacionalização inicial

A aplicação possui suporte inicial a Português e Inglês, com seletor de idioma e persistência da preferência no localStorage. Os principais textos da interface e os dados do cardápio são traduzidos dinamicamente, demonstrando preocupação com escalabilidade e experiência do usuário.

### Testes unitários

O projeto utiliza Vitest para validar funções utilitárias, dados do cardápio, camada de internacionalização e regras de negócio do carrinho. A presença dos testes ajuda a evitar regressões e aumenta a confiabilidade do código durante refatorações.

Atualmente, os testes unitários cobrem cenários como:

- Consistência dos dados do cardápio;
- Tradução de textos da interface;
- Formatação de valores;
- Escape de HTML;
- Busca de produtos por identificador;
- Adição de produtos ao carrinho;
- Remoção de produtos do carrinho;
- Incremento e decremento de quantidade;
- Remoção automática quando a quantidade chega a zero;
- Cálculo de subtotal;
- Cálculo da taxa de entrega;
- Cálculo do total final com entrega ou retirada.

### Testes E2E com Playwright

Os testes E2E simulam fluxos reais de uso da aplicação no navegador. O arquivo `tests/e2e/checkout.e2e.js` valida dois cenários principais:

- Fluxo completo de compra com entrega, incluindo adição de produto, abertura do carrinho, preenchimento de CEP, revisão do pedido, observações e finalização via WhatsApp;
- Fluxo de retirada no local, garantindo que o usuário consiga prosseguir sem preencher endereço de entrega e sem aplicação de taxa de entrega.

Essa camada complementa os testes unitários porque valida a integração entre interface, estado, carrinho, endereço, revisão e finalização do pedido.

### Cobertura de testes

A geração de cobertura com Vitest Coverage V8 foi adicionada para apoiar a evolução técnica do projeto. A pasta `coverage/` é gerada localmente e ignorada pelo Git, mantendo o repositório limpo enquanto permite análise dos módulos mais e menos testados.

### CI/CD com GitHub Actions

A integração contínua automatiza o processo de instalação, testes unitários, build, testes E2E e validação estrutural do projeto, aumentando a confiabilidade do repositório e demonstrando cuidado com qualidade de software.

### Tailwind CSS + estilos customizados

O Tailwind CSS foi utilizado para construção rápida do layout e responsividade. Os estilos específicos de componentes foram centralizados em `styles/style.css`, evitando blocos `<style>` inline no HTML e mantendo a estilização mais organizada.

---

## 🧾 Releases

### v2.6.0 — Testes E2E com Playwright

Versão focada em confiabilidade de fluxo e validação da experiência real do usuário. Foram adicionados testes E2E com Playwright para simular a jornada completa de compra dentro do navegador, cobrindo o fluxo de entrega com preenchimento de endereço via CEP e o fluxo de retirada no local sem necessidade de informar endereço.

Também foi adicionada a configuração `playwright.config.js`, integração dos testes E2E ao workflow de CI do GitHub Actions e inclusão dos relatórios temporários do Playwright no `.gitignore`. Essa evolução complementa os testes unitários existentes e aumenta a segurança para futuras refatorações no carrinho, modais, endereço e finalização do pedido.

### v2.5.0 — Refatoração do carrinho e cobertura de testes

Versão focada em melhoria de arquitetura, organização interna e confiabilidade da aplicação. A lógica de negócio do carrinho foi extraída para o novo módulo `cart-service.js`, separando regras de manipulação de dados da camada de interface. Com isso, o `cart.js` passou a concentrar eventos, renderização e integração com a tela, enquanto o novo serviço concentra operações como adicionar produto, remover produto, alterar quantidade, calcular subtotal, taxa de entrega e total final.

Também foram adicionados testes automatizados para o `cart-service.js`, cobrindo os principais fluxos do carrinho, incluindo adição de itens, incremento e decremento de quantidade, remoção automática ao chegar em zero, cálculo de subtotal, taxa de entrega e total com entrega ou retirada. A versão também adicionou suporte à geração de cobertura com Vitest Coverage V8, incluiu `coverage/` no `.gitignore`, removeu exports internos desnecessários, eliminou estilos residuais e extraiu a duração dos toasts para uma constante centralizada em `config.js`.

### v2.4.0 — Internacionalização inicial

Versão que adicionou suporte inicial à internacionalização no projeto, permitindo alternar a interface entre Português e Inglês. Foram incluídos seletor de idioma, persistência da preferência no `localStorage`, tradução dos principais textos estáticos, tradução dos dados do cardápio renderizado dinamicamente e teste automatizado para a camada de internacionalização.

### v2.3.0 — Testes automatizados com Vitest

Versão que adicionou uma camada inicial de testes automatizados com Vitest, aumentando a confiabilidade do projeto e reduzindo o risco de regressões. Foram criados testes para funções utilitárias, validações, formatação de valores, escape de HTML e consistência dos dados do cardápio. O workflow de CI também passou a executar os testes antes do build.

### v2.2.2 — Correções de consistência estrutural

Versão voltada à correção de inconsistências entre documentação, releases e código-fonte real da branch `main`. Foram reforçadas a remoção do `output.css` do versionamento, a manutenção do arquivo no `.gitignore`, a estrutura modular em `scripts/`, a centralização dos dados do cardápio em `scripts/data.js` e a remoção da dependência do antigo `script.js` na raiz.

### v2.2.1 — Melhorias de SEO e performance

Versão que adicionou melhorias técnicas de SEO, compartilhamento e estabilidade visual. Foram incluídas `meta description` e tags Open Graph (`og:title`, `og:description`, `og:image` e `og:type`), melhorando o preview do site ao ser compartilhado em redes sociais e aplicativos como WhatsApp. Também foram adicionados atributos `width` e `height` nas imagens dos produtos para reduzir o risco de CLS e ajustado o comportamento do background fixo em dispositivos móveis.

### v2.2.0 — Retirada no local e melhorias no carrinho

Versão que tornou o fluxo de pedido mais completo ao adicionar a escolha entre **Entrega** e **Retirada no local**. A taxa de entrega passou a ser removida automaticamente quando o cliente escolhe retirada, e o carrinho recebeu melhorias visuais, incluindo indicador de produto já adicionado, melhor espaçamento dos itens, melhoria no layout do modal e atualização mais consistente do contador de itens.

### v2.1.0 — Campo de observações no pedido

Versão que adicionou um campo opcional de observações na revisão do pedido, permitindo informar preferências, restrições alimentares, ponto da carne, alergias, adicionais ou instruções especiais. As observações passaram a ser incluídas na mensagem enviada pelo WhatsApp, com limite de 280 caracteres e limpeza automática após a finalização do pedido.

### v2.0.0 — Melhorias de navegação, UX e experiência do cardápio

Versão que trouxe melhorias importantes na navegação e na experiência do usuário. Foi adicionada navegação sticky por categorias, com links rápidos para Hambúrgueres, Acompanhamentos e Bebidas, além de estado ativo para indicar a categoria atual. Também foram corrigidos comportamentos de scroll, navegação no final da página e inconsistências do carrinho durante a troca de categorias.

### v1.3.0 — Melhorias de acessibilidade e experiência nos modais

Versão que melhorou a acessibilidade do projeto com foco em navegação por teclado, leitores de tela e clareza no formulário de endereço. Foram adicionados textos alternativos mais descritivos nas imagens, gerenciamento básico de foco nos modais, foco automático ao abrir, focus trap, fechamento por `Esc` e overlay, além de feedback visual e textual para campos preenchidos automaticamente via CEP.

### v1.2.1 — Correções de CI e configuração de produção

Versão com ajustes técnicos após a modularização do JavaScript. O workflow do GitHub Actions foi atualizado para validar a nova estrutura da pasta `scripts/`, a verificação do antigo `script.js` foi removida, os arquivos obrigatórios passaram a ser validados de forma mais coerente e a configuração que deixava a loja forçada como aberta foi corrigida para produção.

### v1.2.0 — Correções no formulário de endereço

Versão que corrigiu a validação do formulário de endereço durante o fluxo de pedido. O campo de número passou a aceitar apenas dígitos, bloqueando letras, emojis, espaços e símbolos. Também foram melhorados o tratamento de CEP inválido, as falhas de rede na consulta da ViaCEP, a limpeza de campos inconsistentes e as mensagens acessíveis com `role="alert"` e `aria-live="polite"`.

### v1.1.0 — Refatoração estrutural e melhorias no fluxo do pedido

Versão que melhorou a organização interna do projeto, reduziu duplicações e corrigiu inconsistências no fluxo de pedido. O cardápio passou a ser renderizado dinamicamente via JavaScript, os dados dos produtos foram centralizados em um array de objetos, o botão de carrinho foi unificado, o `output.css` foi removido do versionamento e os estilos inline foram movidos para `styles/style.css`. Também foram corrigidos o cálculo e a exibição da taxa de entrega no resumo do pedido.

### v1.0.0 — The Burger House

Primeira versão do projeto, com exibição de cardápio, carrinho de compras com persistência em `localStorage`, adição e remoção de itens, checkout via WhatsApp e interface responsiva com Tailwind CSS.

---

## 📈 Melhorias Futuras

- Campo de observações por item, permitindo instruções específicas para cada produto;
- Indicador visual de quantidade diretamente no card do produto;
- Filtro e busca por nome de produto;
- Cálculo de frete por faixa de CEP;
- Ampliação da cobertura de testes para os módulos de endereço, pedido e interface;
- Testes E2E adicionais para validação de erro de CEP, carrinho vazio e troca de idioma;
- Otimização das imagens principais do projeto, especialmente a logo;
- Integração com backend para gerenciamento de pedidos em tempo real;
- Sistema de autenticação de usuários;
- Painel administrativo para gestão do cardápio;
- Integração com banco de dados;
- Histórico de pedidos;
- Página de acompanhamento do pedido.

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

---

## 👨🏻‍💻 Autor

**Marcos Felipe França**

[LinkedIn](https://www.linkedin.com/) · [GitHub](https://github.com/felipe-frc)
