# The Burger House 2.0 — Design system do frontend local

Referência aprovada: missão de refinamento integral de 04/11/2026. Este documento descreve o frontend React em `frontend`; o DESIGN.md da raiz descreve uma implementação anterior e não é a autoridade visual desta landing.

## Identidade e sequência
American Diner contemporâneo, pop e retrô, com fotografia, logo e mascotes originais preservados. Sem redesign das seções.

Hero Royal → Sobre Coral → única faixa GOOD FOOD GOOD TIMES → Vitrine Porcelana → Localização Royal → Carreiras Coral → Footer Porcelana.

- Royal: #2864F0.
- Coral: #E85D4A; hover #D44A37; active #BF3E2C.
- Porcelana: #F5F3EE.
- Amarelo: #FFDC32.
- Ink: #171717.
- Verde WhatsApp: #25D366, exclusivo do contato correspondente.

Preservar as cores dos assets, bandeiras e cartografia externa. Não recolorir imagens para adequá-las à paleta.

## Tokens em src/styles/design-system.css
Anton 400 para títulos e nomes de produto; Barlow Condensed 400–900 para texto, interface e preços. Somente essas fontes são carregadas pelo HTML.

- Hero: escala própria, 4% menor que a anterior em cada breakpoint.
- Títulos principais: `--tbh-text-section: clamp(3rem,5.5vw,5.5rem)`; mobile `clamp(2.5rem,9vw,3.25rem)`; entrelinha 1.12; tracking -.025em.
- Subtítulo: 20px; descrição: 18px/1.5, peso 500; produto: 22px; preço: 20px; botão: 16px; auxiliar: 14px.
- Contêiner útil: máximo 1360px; gutters 40px desktop, 28px tablet e 20px mobile.
- Seções: padding vertical `clamp(56px,5.5vw,88px)`; intervalos principais 24/32/40px.
- CTA: mínimo 48px, padding horizontal 21px, radius 999px, Barlow Condensed 800, ícone 20px. Primário amarelo/Ink; WhatsApp e ações secundárias preservam seus papéis.

Os quatro títulos de seção usam a mesma classe `tbh-section-title`, tamanho, entrelinha e eixo horizontal. Não criar exceções por comprimento da frase: ajustar largura e quebra. A hero é a exceção de escala.

## Contraste
Porcelana/Coral: 3.11:1, adequado aos títulos grandes. Ink/Coral: 5.20:1 para descrições e auxiliares. Royal/Porcelana: 4.54:1. Ink/Amarelo: 13.26:1.

O título de Sobre usa Porcelana: Amarelo/Coral mede 2.55:1 e não atende 3:1 para texto grande. Localização mantém título amarelo sobre Royal.

Não declarar conformidade WCAG completa só com esses pares. Fotos, mapas, overlays e estados reais exigem conferência própria.

## Regras por componente
- Hero: preservar mídia, posição inicial, brasa, entrada e scroll GSAP. Resposta local ao cursor em camada própria; máximo horizontal de 10px no mascote, rotação até 4° com limite automático menor junto ao piso. Somente mouse fino; touch e movimento reduzido não recebem esse efeito. Não reiniciar tweens de elementos neutros.
- Sobre: título à esquerda, descrição à direita, mesma ordem de fotos e fachada inicialmente ativa; galeria operável por teclado e toque. Overlays mais discretos.
- Vitrine: seis produtos originais, 3×2 no desktop, duas colunas no tablet e uma abaixo de 480px para manter imagens e ingredientes legíveis. Row-gap 50px desktop e 48px em telas menores. Texto de ingredientes sem transform/blur.
- Localização: mapa acima da faixa informativa; não trocar Base v4, coordenadas, chave, worker ou pin. Textos de apresentação PT/EN atualizados sem reinicializar o mapa. Unidade e contato demonstrativos.
- Carreiras: coral, título Porcelana, selo amarelo sem riscos, CTA amarelo, foto e mascote preservados. Sem sublinhado ou traços decorativos. Candidatura explicitamente demonstrativa.
- Footer: estrutura compacta aprovada, Porcelana, textos Ink, logo e mascote de óculos originais, fidelidade, WhatsApp, PT/EN e links legais preservados.

## Interação e limites
Foco visível; diálogos da landing com Escape, contenção de Tab e retorno ao controle. O cardápio cede o teclado quando o drawer de pedido existente abre. Não modificar checkout, regras de fidelidade, pagamentos, backend ou dados como parte de um ajuste visual.

Validações e capturas: `../audit/final-ui-2026-11-04/`. Modificações somente locais; sem commit, push, deploy ou alterações em produção.
