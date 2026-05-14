# 🍔 The Burger House

[![CI (Front-end)](https://github.com/felipe-frc/burger-shop/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/felipe-frc/burger-shop/actions)

Aplicação web de cardápio digital para hamburgueria desenvolvida com **HTML5**, **JavaScript Vanilla** e **Tailwind CSS**, com foco em manipulação de DOM, gerenciamento de estado, integração com APIs externas e experiência do usuário.

O projeto permite ao cliente explorar o cardápio por categorias, montar seu pedido com controle de quantidade, preencher o endereço de entrega com busca automática por CEP e finalizar o pedido diretamente pelo WhatsApp — tudo em um fluxo estruturado em etapas, com persistência do carrinho e feedback visual em tempo real.

---

## 🌐 Acesse o Projeto

🔗 **Deploy:** [The Burger House na Vercel](https://burger-shop-aiib.vercel.app/)

📂 **Repositório:** [github.com/felipe-frc/burger-shop](https://github.com/felipe-frc/burger-shop)

A aplicação está publicada na **Vercel** com CI/CD automatizado via **GitHub Actions**.

---

## 📌 Objetivo do Projeto

Este projeto foi desenvolvido com o objetivo de praticar e demonstrar conhecimentos em:

- Construção de interfaces modernas e responsivas com HTML5 e Tailwind CSS;
- Manipulação do DOM com JavaScript puro;
- Renderização dinâmica de componentes via JavaScript;
- Gerenciamento de estado do carrinho sem frameworks;
- Persistência de dados com localStorage;
- Integração com API externa (ViaCEP) para preenchimento de endereço;
- Validações de formulário no front-end;
- Feedback visual com animações, toasts e animações de scroll;
- Acessibilidade com focus trap, aria-live e navegação por teclado;
- Integração contínua e deploy automatizado com GitHub Actions;
- Documentação técnica para portfólio profissional.

---

## 🚀 Funcionalidades

### 📋 Cardápio

- Exibição do cardápio separado por categorias: Hambúrgueres, Acompanhamentos e Bebidas;
- Renderização dinâmica dos produtos via JavaScript;
- Tags de destaque por produto (Mais Pedido, Premium, Exclusivo, Destaque);
- Animação de entrada dos cards ao rolar a página (Intersection Observer).

### 🛒 Carrinho

- Adição e remoção de produtos no carrinho;
- Controle de quantidade de itens por produto;
- Cálculo automático de subtotal e taxa de entrega;
- Persistência do carrinho com localStorage;
- Validação de carrinho vazio antes de prosseguir;
- Feedback visual com toast de confirmação ao adicionar itens.

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
- Envio do pedido formatado diretamente para o WhatsApp;
- Limpeza automática do carrinho e do localStorage após finalização.

### ⚙️ Experiência e Interface

- Status dinâmico da loja (Aberto / Fechado) baseado no horário real;
- Interface responsiva para dispositivos móveis e desktop;
- Modais com focus trap para navegação por teclado;
- Fechamento dos modais pela tecla `Esc` e pelo clique no overlay;
- Acessibilidade com `aria-live`, `aria-modal`, `aria-describedby` e textos alternativos descritivos.

---

## 🛠️ Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Linguagem | HTML5 / CSS3 / JavaScript (ES6+) |
| Estilização | Tailwind CSS |
| Notificações | Toastify JS |
| Ícones | Font Awesome 6 |
| Tipografia | Google Fonts (Inter + Poppins) |
| API de Endereço | ViaCEP |
| Persistência | localStorage |
| Deploy | Vercel |
| CI/CD | GitHub Actions |
| Versionamento | Git / GitHub |

---

## 🏗️ Estrutura do Projeto

```
burger-shop/
│
├── scripts/                  # Módulos JavaScript da aplicação
│   ├── products.js           # Dados dos produtos e renderização do cardápio
│   ├── cart.js               # Gerenciamento do carrinho e localStorage
│   ├── address.js            # Integração com ViaCEP e validações de endereço
│   ├── order.js              # Revisão e finalização do pedido via WhatsApp
│   └── ui.js                 # Controle de modais, animações e status da loja
│
├── styles/
│   └── style.css             # Estilos customizados e componentes
│
├── assets/                   # Imagens e recursos visuais
│
├── docs/images/              # Imagens utilizadas na documentação
│
├── .github/workflows/        # Pipeline de CI/CD
│   └── frontend-ci.yml
│
├── index.html                # Estrutura principal da aplicação
├── output.css                # CSS gerado pelo Tailwind (gitignore)
├── tailwind.config.js        # Configuração do Tailwind CSS
├── package.json              # Configuração do projeto e scripts
└── vercel.json               # Configuração de deploy na Vercel
```

---

## 📸 Interface do Sistema

### 🏠 Página Inicial

Tela inicial com hero section, logo, endereço, horário de funcionamento e status dinâmico da loja.

![Home](https://github.com/felipe-frc/burger-shop/raw/main/docs/images/home.png)

---

### 🍔 Cardápio

Cardápio dividido por categorias, com imagens, descrições, tags de destaque e botão de adição ao carrinho.

![Cardápio](https://github.com/felipe-frc/burger-shop/raw/main/docs/images/menu.png)

---

### 🛒 Carrinho

Modal de carrinho com listagem de itens, controle de quantidade, subtotal, taxa de entrega e ações de navegação.

![Carrinho](https://github.com/felipe-frc/burger-shop/raw/main/docs/images/cart.png)

---

### 📍 Endereço de Entrega

Formulário de endereço com busca automática por CEP, validações e indicação de campos preenchidos automaticamente.

![Endereço](https://github.com/felipe-frc/burger-shop/raw/main/docs/images/address.png)

---

### 📦 Revisão do Pedido

Tela de revisão com itens, endereço, subtotal, taxa de entrega, total final e botão de finalização via WhatsApp.

![Revisão](https://github.com/felipe-frc/burger-shop/raw/main/docs/images/review.png)

---

## ▶️ Como Executar o Projeto

### Pré-requisitos

- Node.js instalado;
- npm instalado;
- Git instalado.

---

### 1. Clone o repositório

```bash
git clone https://github.com/felipe-frc/burger-shop.git
cd burger-shop
```

---

### 2. Instale as dependências

```bash
npm install
```

---

### 3. Execute o projeto em desenvolvimento

```bash
npm run dev
```

O Tailwind CSS ficará em modo watch, recompilando o `output.css` automaticamente a cada alteração.

---

### 4. Acesse no navegador

Abra o arquivo `index.html` diretamente no navegador ou utilize a extensão **Live Server** do VS Code para um servidor local com hot reload.

---

### 5. Gere o build de produção

```bash
npm run build
```

---

## ✅ Qualidade e CI/CD

O projeto possui uma pipeline de **GitHub Actions** configurada para garantir a integridade do repositório a cada alteração enviada para a branch `main`.

O workflow valida:

- Build do Tailwind CSS com `npm run build`;
- Presença dos arquivos obrigatórios do projeto;
- Ausência do arquivo gerado `output.css` no repositório;
- Estrutura dos módulos JavaScript na pasta `scripts/`.

---

## 🧠 Decisões de Desenvolvimento

### Renderização dinâmica do cardápio

Os dados dos produtos são centralizados em um array de objetos no módulo `products.js` e renderizados dinamicamente via JavaScript. Essa abordagem elimina a duplicação entre HTML e atributos `data-*`, facilita a manutenção e aproxima o projeto de uma arquitetura orientada a componentes.

### Modularização do JavaScript

A lógica da aplicação foi separada em módulos por responsabilidade: produtos, carrinho, endereço, pedido e interface. Essa organização melhora a legibilidade, facilita testes e demonstra separação de responsabilidades em projetos front-end sem frameworks.

### Persistência com localStorage

O carrinho é persistido no localStorage, garantindo que os itens não sejam perdidos ao atualizar a página. Após a finalização do pedido, o localStorage é limpo automaticamente para evitar dados residuais de pedidos anteriores.

### Integração com ViaCEP

A API ViaCEP automatiza o preenchimento dos campos de endereço a partir do CEP informado. O formulário inclui tratamento de CEP inválido, falhas de rede e mensagens de erro claras, com limpeza dos campos ao detectar inconsistências.

### Acessibilidade com focus trap

Os modais implementam focus trap básico, movendo o foco automaticamente ao abrir e mantendo a navegação por teclado dentro do modal. O fechamento por `Esc` e pelo clique no overlay também está disponível, seguindo os padrões de acessibilidade esperados em fluxos modais.

### CI/CD com GitHub Actions

A integração contínua automatiza o processo de build e validação do projeto, aumentando a confiabilidade do repositório e demonstrando cuidado com a qualidade do software.

### Tailwind CSS + estilos customizados

O Tailwind CSS foi utilizado para construção rápida do layout e responsividade. Os estilos específicos de componentes foram centralizados em `styles/style.css`, evitando blocos `<style>` inline no HTML.

---

## 🧾 Releases

### v1.3.0 — Melhorias de acessibilidade e experiência nos modais

Versão que melhorou a acessibilidade do projeto com foco em navegação por teclado e leitores de tela. Implementado focus trap nos modais, foco automático ao abrir, fechamento por `Esc` e overlay, textos alternativos descritivos nas imagens e indicações de preenchimento via CEP nos campos readonly.

### v1.2.1 — Correções de CI e configuração de produção

Versão com ajustes técnicos no workflow do GitHub Actions após a modularização do JavaScript. Atualizada a validação dos módulos na pasta `scripts/` e corrigida a configuração de ambiente que deixava a loja forçada como aberta.

### v1.2.0 — Correções no formulário de endereço

Versão que corrigiu a validação do campo de número da casa (bloqueando letras, emojis e símbolos), melhorou o tratamento de CEP inválido com mensagens de erro claras e adicionou `role="alert"` e `aria-live="polite"` às mensagens de validação.

### v1.1.0 — Refatoração estrutural e melhorias no fluxo do pedido

Versão que refatorou o cardápio para renderização dinâmica via JavaScript, unificou o botão de carrinho, removeu o `output.css` do versionamento, centralizou os estilos em `style.css` e corrigiu o fluxo de taxa de entrega com exibição do total final na revisão do pedido.

### v1.0.0 — Burger Shop

Primeira versão do projeto com exibição de cardápio estático, carrinho de compras com localStorage, adição e remoção de itens, checkout via WhatsApp e interface responsiva com Tailwind CSS.

---

## 📈 Melhorias Futuras

- Campo de observações por item (restrições, ponto da carne, alergias);
- Opção de retirada no local como alternativa à entrega;
- Navegação por categorias com barra sticky;
- Indicador visual de quantidade diretamente no card do produto;
- Filtro e busca por nome de produto;
- Cálculo de frete por faixa de CEP;
- Meta tags de Open Graph para preview rico ao compartilhar o link;
- Integração com backend para gerenciamento de pedidos em tempo real;
- Sistema de autenticação de usuários;
- Painel administrativo para gestão do cardápio;
- Integração com banco de dados.

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

---

## 👨‍💻 Autor

**Marcos Felipe França**

[LinkedIn](https://www.linkedin.com/) · [GitHub](https://github.com/felipe-frc)